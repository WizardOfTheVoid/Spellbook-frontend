using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class KeyPressService(
    ConsoleCommandGate commandGate,
    IKeyPressRuntime runtime,
    MovementActivityTracker movementActivity,
    IOptionsMonitor<CoreHostOptions> options)
{
    private const int MaximumVirtualKey = 254;
    private const int MaximumDurationMs = 60_000;

    public Task<ConsoleExecutionResult> ExecuteAsync(
        KeyPressRequest request,
        CancellationToken cancellationToken)
    {
        return ExecuteAsync(
            request.Id,
            [new KeySequenceEntry(request.VirtualKey, request.DurationMs)],
            request.RestoreTarget,
            "keyPress",
            null,
            cancellationToken);
    }

    public Task<ConsoleExecutionResult> ExecuteSequenceAsync(
        KeySequenceRequest request,
        CancellationToken cancellationToken)
    {
        return ExecuteAsync(
            request.Id,
            request.Presses,
            request.RestoreTarget,
            "keySequence",
            request.MinimumMovementIdleMs,
            cancellationToken);
    }

    private async Task<ConsoleExecutionResult> ExecuteAsync(
        string? requestedId,
        IReadOnlyList<KeySequenceEntry>? requestedPresses,
        JsonElement? restoreTarget,
        string command,
        int? minimumMovementIdleMs,
        CancellationToken cancellationToken)
    {
        if (!RequestValidators.TryNormalizeRequestId(
            requestedId,
            out var requestId,
            out var requestIdError))
        {
            return Invalid(requestIdError!, requestId);
        }

        if (requestedPresses is not { Count: > 0 })
        {
            return Invalid(
                "At least one key press is required.",
                requestId);
        }

        if (minimumMovementIdleMs is <= 0)
        {
            return Invalid(
                "Minimum movement idle time must be greater than zero milliseconds.",
                requestId);
        }

        var presses = new List<ValidatedKeyPress>(requestedPresses.Count);
        for (var index = 0; index < requestedPresses.Count; index += 1)
        {
            var requestedPress = requestedPresses[index];
            if (requestedPress.VirtualKey is null or < 1 or > MaximumVirtualKey)
            {
                return Invalid(
                    $"Virtual key at position {index + 1} must be between 1 and {MaximumVirtualKey}.",
                    requestId);
            }

            var durationMs = requestedPress.DurationMs ?? 0;
            if (durationMs is < 0 or > MaximumDurationMs)
            {
                return Invalid(
                    $"Press duration at position {index + 1} must be between 0 and {MaximumDurationMs} milliseconds.",
                    requestId);
            }

            presses.Add(new ValidatedKeyPress(
                (ushort)requestedPress.VirtualKey.Value,
                durationMs));
        }

        var restoreRequested = restoreTarget.HasValue;
        RestoreTargetValidationResult resolved;
        try
        {
            resolved = runtime.ResolveQueueTarget(restoreTarget);
        }
        catch (Exception ex)
        {
            return ExecutionFailure(requestId, ex);
        }

        if (!resolved.Ok || resolved.Target is null)
        {
            return ValidationFailure(requestId, resolved);
        }

        ConsoleCommandLease lease;
        try
        {
            lease = await commandGate.WaitAsync(
                resolved.Target,
                cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return Timeout(requestId);
        }

        var result = await ExecuteOwnedAsync(
            requestId,
            presses,
            command,
            restoreRequested,
            minimumMovementIdleMs,
            lease,
            cancellationToken).ConfigureAwait(false);
        var sessionWarnings = await commandGate.CompleteAsync(
            lease,
            result.Ok,
            async () =>
            {
                var completed = await runtime.CompleteAsync(
                    result,
                    lease.RestoreTarget,
                    restoreRequested).ConfigureAwait(false);
                return completed.Warnings.Except(result.Warnings).ToArray();
            },
            options.CurrentValue.Timing.AfterQueueEmptyMs).ConfigureAwait(false);
        return result.WithWarnings(sessionWarnings);
    }

    private async Task<ConsoleExecutionResult> ExecuteOwnedAsync(
        string requestId,
        IReadOnlyList<ValidatedKeyPress> presses,
        string command,
        bool restoreRequested,
        int? minimumMovementIdleMs,
        ConsoleCommandLease lease,
        CancellationToken cancellationToken)
    {
        try
        {
            var validation = runtime.ValidateQueueTarget(
                lease.RestoreTarget,
                requireForeground: restoreRequested && lease.StartsSession);
            if (!validation.Ok)
            {
                return ValidationFailure(requestId, validation);
            }

            if (minimumMovementIdleMs.HasValue && !movementActivity.IsAvailable)
            {
                return ConsoleExecutionResult.Success(
                    requestId,
                    command,
                    new
                    {
                        executed = false,
                        reason = "MOVEMENT_MONITOR_UNAVAILABLE"
                    });
            }

            if (minimumMovementIdleMs.HasValue)
            {
                var movementIdle = movementActivity.GetIdleDuration();
                if (movementIdle < TimeSpan.FromMilliseconds(minimumMovementIdleMs.Value))
                {
                    return ConsoleExecutionResult.Success(
                        requestId,
                        command,
                        new
                        {
                            executed = false,
                            reason = "RECENT_MOVEMENT",
                            movementIdleMs = (long)movementIdle.TotalMilliseconds
                        });
                }
            }

            var focus = await runtime.FocusGameAsync(cancellationToken).ConfigureAwait(false);
            if (!focus.Ok)
            {
                return OperationFailure(focus, requestId);
            }

            foreach (var press in presses)
            {
                var operation = await runtime.PressVirtualKeyAsync(
                    press.VirtualKey,
                    press.DurationMs,
                    cancellationToken).ConfigureAwait(false);
                if (!operation.Ok)
                {
                    return OperationFailure(operation, requestId);
                }
            }

            return ConsoleExecutionResult.Success(
                requestId,
                command,
                ResultData(command, presses));
        }
        catch (OperationCanceledException)
        {
            return Timeout(requestId);
        }
        catch (Exception ex)
        {
            return ExecutionFailure(requestId, ex);
        }
    }

    private static object ResultData(
        string command,
        IReadOnlyList<ValidatedKeyPress> presses)
    {
        if (command == "keyPress")
        {
            var press = presses[0];
            return new
            {
                virtualKey = press.VirtualKey,
                durationMs = press.DurationMs
            };
        }

        return new
        {
            presses = presses.Select(press => new
            {
                virtualKey = press.VirtualKey,
                durationMs = press.DurationMs
            }).ToArray()
        };
    }

    private static ConsoleExecutionResult Invalid(string message, string? requestId)
    {
        return ConsoleExecutionResult.Failure(
            "INVALID_REQUEST",
            message,
            requestId);
    }

    private static ConsoleExecutionResult Timeout(string requestId)
    {
        return ConsoleExecutionResult.Failure(
            "COMMAND_TIMEOUT",
            "Key press execution timed out.",
            requestId,
            StatusCodes.Status504GatewayTimeout);
    }

    private static ConsoleExecutionResult ValidationFailure(
        string requestId,
        RestoreTargetValidationResult validation)
    {
        var errorCode = validation.ErrorCode ?? "INVALID_RESTORE_TARGET";
        return ConsoleExecutionResult.Failure(
            errorCode,
            validation.ErrorMessage ?? "The key press target is invalid.",
            requestId,
            StatusForError(errorCode));
    }

    private static ConsoleExecutionResult OperationFailure(
        OperationResult operation,
        string requestId)
    {
        var errorCode = operation.ErrorCode ?? "INPUT_FAILED";
        return ConsoleExecutionResult.Failure(
            errorCode,
            operation.ErrorMessage ?? "Key press execution failed.",
            requestId,
            StatusForError(errorCode));
    }

    private static ConsoleExecutionResult ExecutionFailure(
        string requestId,
        Exception exception)
    {
        return ConsoleExecutionResult.Failure(
            "INPUT_FAILED",
            $"Key press execution failed: {exception.Message}",
            requestId,
            StatusCodes.Status500InternalServerError);
    }

    private static int StatusForError(string? code)
    {
        return code switch
        {
            "PROCESS_NOT_ALLOWED" => StatusCodes.Status403Forbidden,
            "GAME_NOT_RUNNING" => StatusCodes.Status404NotFound,
            "MULTIPLE_GAMES_FOUND" or
                "WINDOW_NOT_FOUND" or
                "FOCUS_FAILED" or
                "FOREGROUND_VERIFY_FAILED" or
                "INPUT_BLOCKED" or
                "INPUT_FAILED" or
                "RESTORE_TARGET_INACTIVE" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };
    }

    private sealed record ValidatedKeyPress(
        ushort VirtualKey,
        int DurationMs);
}
