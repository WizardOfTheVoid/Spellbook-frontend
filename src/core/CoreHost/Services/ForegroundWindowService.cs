using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Win32;

namespace CoreHost.Services;

public sealed class ForegroundWindowService(IWindowApi windowApi)
{
    public IntPtr GetForegroundWindow()
    {
        return windowApi.GetForegroundWindow();
    }

    public async Task<OperationResult> FocusAndVerifyAsync(
        IntPtr windowHandle,
        WindowOptions timing,
        CancellationToken cancellationToken,
        string? requestId = null,
        Action<string>? writeTiming = null,
        Func<bool>? validateTarget = null)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (windowHandle == IntPtr.Zero)
        {
            return OperationResult.Failure("WINDOW_NOT_FOUND", "The configured Chivalry 2 window handle is empty.");
        }

        var focus = await RequestAndVerifyForegroundAsync(
            windowHandle,
            timing,
            cancellationToken,
            requestId,
            "focus-game",
            writeTiming,
            validateTarget).ConfigureAwait(false);
        if (focus.TargetChanged) return TargetChanged();
        if (focus.Verified)
        {
            return OperationResult.Success();
        }

        return focus.RequestAccepted
            ? OperationResult.Failure("FOREGROUND_VERIFY_FAILED", "Chivalry 2 was focused but foreground verification failed.")
            : OperationResult.Failure("FOCUS_FAILED", "Could not focus the configured Chivalry 2 window.");
    }

    public async Task<OperationResult> RestoreAndVerifyAsync(
        IntPtr windowHandle,
        WindowOptions timing,
        CancellationToken cancellationToken,
        string? requestId = null,
        Action<string>? writeTiming = null,
        Func<bool>? validateTarget = null)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (windowHandle == IntPtr.Zero)
        {
            return OperationResult.Failure("FOREGROUND_RESTORE_FAILED", "The requested foreground window handle is empty.");
        }

        var focus = await RequestAndVerifyForegroundAsync(
            windowHandle,
            timing,
            cancellationToken,
            requestId,
            "restore-overlay",
            writeTiming,
            validateTarget).ConfigureAwait(false);
        if (focus.TargetChanged) return TargetChanged();
        if (!focus.Verified)
        {
            return OperationResult.Failure("FOREGROUND_RESTORE_FAILED", "Could not restore and verify the requested foreground window.");
        }

        if (timing.RestoreSettleMs > 0)
        {
            await Task.Delay(timing.RestoreSettleMs, cancellationToken).ConfigureAwait(false);
        }

        cancellationToken.ThrowIfCancellationRequested();
        return validateTarget?.Invoke() == false ? TargetChanged() : OperationResult.Success();
    }

    private async Task<(bool Verified, bool RequestAccepted, bool TargetChanged)> RequestAndVerifyForegroundAsync(
        IntPtr windowHandle,
        WindowOptions timing,
        CancellationToken cancellationToken,
        string? requestId,
        string leg,
        Action<string>? writeTiming,
        Func<bool>? validateTarget)
    {
        var trace = new TimingLog();
        var attempts = 0;
        var alreadyForeground = false;
        var requestAccepted = false;
        var verified = false;
        void validate()
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (validateTarget?.Invoke() == false) throw new WindowTargetChangedException();
        }

        try
        {
            validate();
            if (trace.Measure("isIconic", () => windowApi.IsIconic(windowHandle)))
            {
                validate();
                trace.Measure("showRestore", () => windowApi.ShowWindow(windowHandle, NativeMethods.SW_RESTORE));
            }

            var deadline = DateTimeOffset.UtcNow.AddMilliseconds(Math.Max(0, timing.FocusTimeoutMs));

            while (true)
            {
                validate();
                if (trace.Measure("foregroundCheck", windowApi.GetForegroundWindow) == windowHandle)
                {
                    validate();
                    alreadyForeground = attempts == 0;
                    verified = true;
                    return (true, requestAccepted, false);
                }

                attempts++;
                requestAccepted = TryRequestForeground(windowHandle, trace, validate) || requestAccepted;

                validate();
                if (trace.Measure("foregroundCheck", windowApi.GetForegroundWindow) == windowHandle)
                {
                    validate();
                    verified = true;
                    return (true, requestAccepted, false);
                }

                if (DateTimeOffset.UtcNow >= deadline)
                {
                    return (false, requestAccepted, false);
                }

                await trace.MeasureAsync(
                    "pollWait",
                    () => Task.Delay(5, cancellationToken)).ConfigureAwait(false);
            }
        }
        catch (WindowTargetChangedException) { return (false, requestAccepted, true); }
        finally
        {
            if (!string.IsNullOrWhiteSpace(requestId))
            {
                trace.Write(
                    "core-focus-timing",
                    writeTiming,
                    $"requestId={requestId}",
                    $"leg={leg}",
                    $"alreadyForeground={alreadyForeground.ToString().ToLowerInvariant()}",
                    $"attempts={attempts}",
                    $"requestAccepted={requestAccepted.ToString().ToLowerInvariant()}",
                    $"verified={verified.ToString().ToLowerInvariant()}");
            }
        }
    }

    private bool TryRequestForeground(IntPtr windowHandle, TimingLog trace, Action validate)
    {
        var threadIds = trace.Measure("threadLookup", () =>
        {
            var currentThreadId = windowApi.GetCurrentThreadId();
            var targetThreadId = windowApi.GetWindowThreadProcessId(windowHandle, out _);
            var foregroundWindow = windowApi.GetForegroundWindow();
            var foregroundThreadId = foregroundWindow == IntPtr.Zero
                ? 0
                : windowApi.GetWindowThreadProcessId(foregroundWindow, out _);
            return (Current: currentThreadId, Target: targetThreadId, Foreground: foregroundThreadId);
        });

        var attachedTarget = false;
        var attachedForeground = false;

        try
        {
            validate();
            if (threadIds.Target != 0 && threadIds.Target != threadIds.Current)
            {
                attachedTarget = trace.Measure(
                    "attach",
                    () => windowApi.AttachThreadInput(threadIds.Current, threadIds.Target, true));
            }

            if (threadIds.Foreground != 0 &&
                threadIds.Foreground != threadIds.Current &&
                threadIds.Foreground != threadIds.Target)
            {
                validate();
                attachedForeground = trace.Measure(
                    "attach",
                    () => windowApi.AttachThreadInput(threadIds.Current, threadIds.Foreground, true));
            }

            validate();
            var requestAccepted = trace.Measure("set", () => windowApi.SetForegroundWindow(windowHandle));
            if (!requestAccepted)
            {
                validate();
                trace.Measure("bring", () => windowApi.BringWindowToTop(windowHandle));
            }

            return requestAccepted;
        }
        finally
        {
            if (attachedForeground)
            {
                trace.Measure(
                    "detach",
                    () => windowApi.AttachThreadInput(threadIds.Current, threadIds.Foreground, false));
            }

            if (attachedTarget)
            {
                trace.Measure(
                    "detach",
                    () => windowApi.AttachThreadInput(threadIds.Current, threadIds.Target, false));
            }
        }
    }

    private static OperationResult TargetChanged() => OperationResult.Failure("WINDOW_TARGET_CHANGED", "The window target changed before foreground verification completed.");
    private sealed class WindowTargetChangedException : Exception;
}
