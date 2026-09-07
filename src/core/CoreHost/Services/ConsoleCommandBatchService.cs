using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class ConsoleCommandBatchService(
    ConsoleCommandGate commandGate,
    IConsoleBatchRuntime runtime,
    IOptionsMonitor<CoreHostOptions> options,
    IGameInputActivityGate activityGate)
{
    public Task<ConsoleExecutionResult> ExecuteAsync(
        string requestId,
        IReadOnlyList<PreparedConsoleCommand> commands,
        JsonElement? restoreTarget,
        CancellationToken cancellationToken)
    {
        return ExecuteAsync(
            requestId,
            commands,
            restoreTarget,
            background: false,
            requireIdle: false,
            cancellationToken);
    }

    public async Task<ConsoleExecutionResult> ExecuteAsync(
        string requestId,
        IReadOnlyList<PreparedConsoleCommand> commands,
        JsonElement? restoreTarget,
        bool background,
        CancellationToken cancellationToken)
    {
        return await ExecuteAsync(
            requestId,
            commands,
            restoreTarget,
            background,
            requireIdle: false,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<ConsoleExecutionResult> ExecuteAsync(
        string requestId,
        IReadOnlyList<PreparedConsoleCommand> commands,
        JsonElement? restoreTarget,
        bool background,
        bool requireIdle,
        CancellationToken cancellationToken)
    {
        if (requireIdle && !background)
        {
            return ConsoleExecutionResult.Failure(
                "INVALID_REQUEST",
                "RequireIdle can only be used with background execution.",
                requestId);
        }

        RestoreTargetValidationResult resolved;
        try
        {
            resolved = runtime.ResolveExecutionTarget(restoreTarget, background);
        }
        catch (Exception ex)
        {
            return ValidationException(requestId, ex);
        }

        if (!resolved.Ok || resolved.Target is null)
        {
            return ValidationFailure(requestId, resolved);
        }

        ConsoleCommandLease lease;
        try
        {
            lease = await commandGate.WaitAsync(resolved.Target, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            return Timeout(requestId, sentCommands: 0, failedCommandIndex: null);
        }

        var execution = await ExecuteOwnedAsync(
            requestId,
            commands,
            lease,
            background,
            requireIdle,
            cancellationToken).ConfigureAwait(false);
        await DelayAfterCommandAsync(execution.Attempt).ConfigureAwait(false);

        var sessionWarnings = await commandGate.CompleteAsync(
            lease,
            execution.Result.Ok,
            () => CompleteSessionAsync(
                execution,
                lease.RestoreTarget,
                restoreForeground: !background),
            options.CurrentValue.Timing.AfterQueueEmptyMs).ConfigureAwait(false);
        return execution.Result.WithWarnings(sessionWarnings);
    }

    private async Task<BatchExecution> ExecuteOwnedAsync(
        string requestId,
        IReadOnlyList<PreparedConsoleCommand> commands,
        ConsoleCommandLease lease,
        bool background,
        bool requireIdle,
        CancellationToken cancellationToken)
    {
        try
        {
            var activitySkip = activityGate.Check(requestId, requireIdle);
            if (activitySkip is not null)
            {
                return new BatchExecution(
                    activitySkip,
                    new ConsoleOpenAttemptState(),
                    RequiresCleanup: !lease.StartsSession);
            }

            var validation = runtime.ValidateExecutionTarget(
                lease.RestoreTarget,
                requireForeground: !background && lease.StartsSession);
            if (!validation.Ok)
            {
                return new BatchExecution(
                    ValidationFailure(requestId, validation),
                    new ConsoleOpenAttemptState(),
                    RequiresCleanup: !lease.StartsSession);
            }

            return await ExecuteBatchAsync(
                requestId,
                commands,
                lease.RestoreTarget,
                background,
                cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return new BatchExecution(
                ValidationException(requestId, ex),
                new ConsoleOpenAttemptState(),
                RequiresCleanup: !lease.StartsSession);
        }
    }

    private async Task<IReadOnlyList<string>> CompleteSessionAsync(
        BatchExecution execution,
        ValidatedRestoreTarget restoreTarget,
        bool restoreForeground)
    {
        if (!execution.RequiresCleanup)
        {
            return [];
        }

        var completed = await runtime.CompleteAsync(
            execution.Result,
            execution.Attempt,
            restoreTarget,
            restoreForeground).ConfigureAwait(false);
        return completed.Warnings.Except(execution.Result.Warnings).ToArray();
    }

    private async Task DelayAfterCommandAsync(ConsoleOpenAttemptState attempt)
    {
        if (!attempt.CommandSubmitted)
        {
            return;
        }

        var delayMs = Math.Max(
            0,
            options.CurrentValue.Timing.AfterCommandDelayMs);
        if (delayMs > 0)
        {
            await Task.Delay(delayMs, CancellationToken.None).ConfigureAwait(false);
        }
    }

    private async Task<BatchExecution> ExecuteBatchAsync(
        string requestId,
        IReadOnlyList<PreparedConsoleCommand> commands,
        ValidatedRestoreTarget leaseTarget,
        bool background,
        CancellationToken cancellationToken)
    {
        var sentCommands = 0;
        int? activeCommandIndex = null;
        var currentAttempt = new ConsoleOpenAttemptState();

        try
        {
            var focus = await runtime.FocusGameAsync(
                leaseTarget,
                background,
                cancellationToken).ConfigureAwait(false);
            if (!focus.Ok)
            {
                return new BatchExecution(
                    OperationFailure(focus, requestId, sentCommands, failedCommandIndex: null),
                    currentAttempt);
            }

            for (var commandIndex = 0; commandIndex < commands.Count; commandIndex++)
            {
                activeCommandIndex = commandIndex;
                currentAttempt = new ConsoleOpenAttemptState();
                var submit = await runtime.SubmitAsync(
                    commands[commandIndex],
                    currentAttempt,
                    cancellationToken).ConfigureAwait(false);

                if (submit.EnterSent)
                {
                    sentCommands++;
                    activeCommandIndex = null;
                }

                if (submit.Cancelled)
                {
                    return new BatchExecution(
                        Timeout(requestId, sentCommands, activeCommandIndex),
                        currentAttempt);
                }

                if (!submit.Operation.Ok)
                {
                    return new BatchExecution(
                        OperationFailure(
                            submit.Operation,
                            requestId,
                            sentCommands,
                            activeCommandIndex),
                        currentAttempt);
                }
            }

            return new BatchExecution(
                ConsoleExecutionResult.Success(
                    requestId,
                    "batch",
                    new { sent = true, sentCommands, failedCommandIndex = (int?)null }),
                currentAttempt);
        }
        catch (OperationCanceledException)
        {
            CountCurrentAttemptIfSubmitted(
                currentAttempt,
                ref sentCommands,
                ref activeCommandIndex);
            return new BatchExecution(
                Timeout(requestId, sentCommands, activeCommandIndex),
                currentAttempt);
        }
        catch (Exception ex)
        {
            CountCurrentAttemptIfSubmitted(
                currentAttempt,
                ref sentCommands,
                ref activeCommandIndex);
            return new BatchExecution(
                ConsoleExecutionResult.Failure(
                    "INPUT_FAILED",
                    $"Console batch execution failed: {ex.Message}",
                    requestId,
                    StatusCodes.Status500InternalServerError,
                    data: Progress(sentCommands, activeCommandIndex)),
                currentAttempt);
        }
    }

    private static void CountCurrentAttemptIfSubmitted(
        ConsoleOpenAttemptState attempt,
        ref int sentCommands,
        ref int? activeCommandIndex)
    {
        if (activeCommandIndex is not null && attempt.CommandSubmitted)
        {
            sentCommands++;
            activeCommandIndex = null;
        }
    }

    private static ConsoleExecutionResult OperationFailure(
        OperationResult operation,
        string requestId,
        int sentCommands,
        int? failedCommandIndex)
    {
        var errorCode = operation.ErrorCode ?? "INPUT_FAILED";
        return ConsoleExecutionResult.Failure(
            errorCode,
            operation.ErrorMessage ?? "Console batch execution failed.",
            requestId,
            StatusForError(errorCode),
            data: Progress(sentCommands, failedCommandIndex));
    }

    private static ConsoleExecutionResult Timeout(
        string requestId,
        int sentCommands,
        int? failedCommandIndex)
    {
        return ConsoleExecutionResult.Failure(
            "COMMAND_TIMEOUT",
            "Console command execution timed out.",
            requestId,
            StatusCodes.Status504GatewayTimeout,
            data: Progress(sentCommands, failedCommandIndex));
    }

    private static ConsoleExecutionResult ValidationFailure(
        string requestId,
        RestoreTargetValidationResult validation)
    {
        var errorCode = validation.ErrorCode ?? "INVALID_RESTORE_TARGET";
        return ConsoleExecutionResult.Failure(
            errorCode,
            validation.ErrorMessage ?? "The restore target is invalid.",
            requestId,
            StatusForError(errorCode),
            data: Progress(sentCommands: 0, failedCommandIndex: null));
    }

    private static ConsoleExecutionResult ValidationException(string requestId, Exception exception)
    {
        return ConsoleExecutionResult.Failure(
            "INPUT_FAILED",
            $"Console batch validation failed: {exception.Message}",
            requestId,
            StatusCodes.Status500InternalServerError,
            data: Progress(sentCommands: 0, failedCommandIndex: null));
    }

    private static object Progress(int sentCommands, int? failedCommandIndex)
    {
        return new { sentCommands, failedCommandIndex };
    }

    private static int StatusForError(string? code)
    {
        return code switch
        {
            "UNAUTHORIZED" => StatusCodes.Status401Unauthorized,
            "FORBIDDEN_CAPABILITY" or "PROCESS_NOT_ALLOWED" => StatusCodes.Status403Forbidden,
            "GAME_NOT_RUNNING" => StatusCodes.Status404NotFound,
            "MULTIPLE_GAMES_FOUND" or "WINDOW_NOT_FOUND" or "FOCUS_FAILED" or "FOREGROUND_VERIFY_FAILED" or "INPUT_BLOCKED" or "INPUT_FAILED" or "RESTORE_TARGET_INACTIVE" => StatusCodes.Status409Conflict,
            "COMMAND_TIMEOUT" or "CLIPBOARD_TIMEOUT" or "CLIPBOARD_NOT_READY" => StatusCodes.Status504GatewayTimeout,
            "CLIPBOARD_UNAVAILABLE" => StatusCodes.Status503ServiceUnavailable,
            _ => StatusCodes.Status400BadRequest
        };
    }

    private sealed record BatchExecution(
        ConsoleExecutionResult Result,
        ConsoleOpenAttemptState Attempt,
        bool RequiresCleanup = true);
}
