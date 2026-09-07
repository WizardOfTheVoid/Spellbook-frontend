using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class ConsoleCommandCleanupService(
    IOptionsMonitor<CoreHostOptions> options,
    IConsoleCleanupInput cleanupInput,
    RestoreTargetValidator restoreTargetValidator,
    ForegroundWindowService foreground)
{
    public async Task<ConsoleExecutionResult> CompleteAsync(
        ConsoleExecutionResult result,
        bool consoleMayBeOpen,
        bool commandSubmitted,
        ValidatedRestoreTarget restoreTarget,
        bool restoreForeground = true)
    {
        var warnings = new List<string>();
        ConsoleAutomationOptions? consoleOptions = null;
        TimingOptions timing;
        try
        {
            var currentOptions = options.CurrentValue;
            consoleOptions = currentOptions.Console;
            timing = currentOptions.Timing;
        }
        catch
        {
            timing = new TimingOptions();
            warnings.Add("INPUT_FAILED");
        }

        if (consoleMayBeOpen && consoleOptions is not null)
        {
            if (string.Equals(consoleOptions.CloseMode, "None", StringComparison.OrdinalIgnoreCase))
            {
                if (!commandSubmitted)
                {
                    warnings.Add("CONSOLE_CLOSE_NOT_CONFIGURED");
                }
            }
            else
            {
                try
                {
                    var close = await cleanupInput.SendConsoleCloseSequenceAsync(
                        consoleOptions,
                        timing,
                        CancellationToken.None).ConfigureAwait(false);
                    if (!close.Ok)
                    {
                        warnings.Add(close.ErrorCode ?? "INPUT_FAILED");
                    }
                }
                catch
                {
                    warnings.Add("INPUT_FAILED");
                }
            }
        }

        if (!restoreForeground)
        {
            return warnings.Count == 0 ? result : result.WithWarnings(warnings);
        }

        if (!IsStillOwnedWindow(restoreTarget))
        {
            warnings.Add("RESTORE_TARGET_LOST");
            return result.WithWarnings(warnings);
        }

        try
        {
            var restore = await foreground.RestoreAndVerifyAsync(
                restoreTarget.WindowHandle,
                timing,
                CancellationToken.None,
                result.RequestId).ConfigureAwait(false);
            if (!restore.Ok)
            {
                warnings.Add(RestoreWarning(restoreTarget));
            }
        }
        catch
        {
            warnings.Add(RestoreWarning(restoreTarget));
        }

        return warnings.Count == 0 ? result : result.WithWarnings(warnings);
    }

    private bool IsStillOwnedWindow(ValidatedRestoreTarget restoreTarget)
    {
        try
        {
            return restoreTargetValidator.IsStillOwnedWindow(restoreTarget);
        }
        catch
        {
            return false;
        }
    }

    private string RestoreWarning(ValidatedRestoreTarget restoreTarget)
    {
        return IsStillOwnedWindow(restoreTarget)
            ? "FOREGROUND_RESTORE_FAILED"
            : "RESTORE_TARGET_LOST";
    }
}
