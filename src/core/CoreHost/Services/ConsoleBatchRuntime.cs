using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class ConsoleBatchRuntime(
    IOptionsMonitor<CoreHostOptions> options,
    IConsoleExecutionTargetResolver executionTargets,
    ForegroundWindowService foreground,
    SendInputService sendInput,
    ConsoleCommandCleanupService cleanup,
    IClipboardService clipboard) : IConsoleBatchRuntime
{
    public RestoreTargetValidationResult ResolveExecutionTarget(
        JsonElement? restoreTarget,
        bool background)
    {
        return executionTargets.Resolve(restoreTarget, background);
    }

    public RestoreTargetValidationResult ValidateExecutionTarget(
        ValidatedRestoreTarget restoreTarget,
        bool requireForeground)
    {
        return executionTargets.Validate(restoreTarget, requireForeground);
    }

    public async Task<OperationResult> FocusGameAsync(
        ValidatedRestoreTarget leaseTarget,
        bool background,
        CancellationToken cancellationToken)
    {
        var target = executionTargets.ResolveGameTarget(leaseTarget, background);
        if (!target.Ok || target.Target is null)
        {
            return OperationResult.Failure(
                target.ErrorCode ?? "GAME_NOT_RUNNING",
                target.ErrorMessage ?? "No configured Chivalry 2 process is running.");
        }

        return await foreground.FocusAndVerifyAsync(
            target.Target.WindowHandle,
            options.CurrentValue.Timing,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<ConsoleCommandSubmitResult> SubmitAsync(
        PreparedConsoleCommand command,
        ConsoleOpenAttemptState attempt,
        CancellationToken cancellationToken)
    {
        try
        {
            await DelayIfPositiveAsync(command.DelayMs, cancellationToken).ConfigureAwait(false);

            var currentOptions = options.CurrentValue;
            var useClipboard = IsClipboardPasteInputMode(currentOptions.Console.CommandInputMode);
            if (useClipboard)
            {
                var setClipboard = await clipboard.SetTextAsync(command.Command, cancellationToken).ConfigureAwait(false);
                if (!setClipboard.Ok)
                {
                    return Result(setClipboard, attempt);
                }
            }

            var open = await sendInput.SendConsoleOpenSequenceAsync(
                currentOptions.Console,
                currentOptions.Timing,
                attempt,
                cancellationToken).ConfigureAwait(false);
            if (!open.Ok)
            {
                return Result(open, attempt);
            }

            await DelayIfPositiveAsync(currentOptions.Timing.ConsoleOpenDelayMs, cancellationToken).ConfigureAwait(false);

            var writeCommand = useClipboard
                ? await sendInput.PressPasteAsync(currentOptions.Timing, cancellationToken).ConfigureAwait(false)
                : await sendInput.SendUnicodeTextAsync(command.Command, currentOptions.Timing, cancellationToken).ConfigureAwait(false);
            if (!writeCommand.Ok)
            {
                return Result(writeCommand, attempt);
            }

            await DelayIfPositiveAsync(currentOptions.Timing.BeforeEnterDelayMs, cancellationToken).ConfigureAwait(false);
            var enter = await sendInput.PressEnterAsync(
                currentOptions.Timing,
                attempt,
                cancellationToken).ConfigureAwait(false);
            return Result(enter, attempt);
        }
        catch (OperationCanceledException)
        {
            return new ConsoleCommandSubmitResult(
                OperationResult.Failure("COMMAND_TIMEOUT", "Console command execution timed out."),
                attempt.CommandSubmitted,
                Cancelled: true);
        }
    }

    public Task<ConsoleExecutionResult> CompleteAsync(
        ConsoleExecutionResult result,
        ConsoleOpenAttemptState attempt,
        ValidatedRestoreTarget restoreTarget,
        bool restoreForeground)
    {
        return cleanup.CompleteAsync(
            result,
            attempt.MayBeOpen,
            attempt.CommandSubmitted,
            restoreTarget,
            restoreForeground);
    }

    private static bool IsClipboardPasteInputMode(string inputMode)
    {
        return inputMode.Equals("ClipboardPaste", StringComparison.OrdinalIgnoreCase) ||
            inputMode.Equals("Paste", StringComparison.OrdinalIgnoreCase);
    }

    private static ConsoleCommandSubmitResult Result(
        OperationResult operation,
        ConsoleOpenAttemptState attempt)
    {
        return new ConsoleCommandSubmitResult(
            operation,
            attempt.CommandSubmitted,
            Cancelled: false);
    }

    private static async Task DelayIfPositiveAsync(int delayMs, CancellationToken cancellationToken)
    {
        if (delayMs > 0)
        {
            await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
        }
    }
}
