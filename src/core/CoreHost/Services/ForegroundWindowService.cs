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
        TimingOptions timing,
        CancellationToken cancellationToken,
        string? requestId = null,
        Action<string>? writeTiming = null)
    {
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
            writeTiming).ConfigureAwait(false);
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
        TimingOptions timing,
        CancellationToken cancellationToken,
        string? requestId = null,
        Action<string>? writeTiming = null)
    {
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
            writeTiming).ConfigureAwait(false);
        if (!focus.Verified)
        {
            return OperationResult.Failure("FOREGROUND_RESTORE_FAILED", "Could not restore and verify the requested foreground window.");
        }

        if (timing.RestoreFocusDelayMs > 0)
        {
            await Task.Delay(timing.RestoreFocusDelayMs, cancellationToken).ConfigureAwait(false);
        }

        return OperationResult.Success();
    }

    private async Task<(bool Verified, bool RequestAccepted)> RequestAndVerifyForegroundAsync(
        IntPtr windowHandle,
        TimingOptions timing,
        CancellationToken cancellationToken,
        string? requestId,
        string leg,
        Action<string>? writeTiming)
    {
        var trace = new TimingLog();
        var attempts = 0;
        var alreadyForeground = false;
        var requestAccepted = false;
        var verified = false;

        try
        {
            if (trace.Measure("isIconic", () => windowApi.IsIconic(windowHandle)))
            {
                trace.Measure("showRestore", () => windowApi.ShowWindow(windowHandle, NativeMethods.SW_RESTORE));
            }

            var deadline = DateTimeOffset.UtcNow.AddMilliseconds(Math.Max(0, timing.FocusTimeoutMs));

            while (true)
            {
                if (trace.Measure("foregroundCheck", windowApi.GetForegroundWindow) == windowHandle)
                {
                    alreadyForeground = attempts == 0;
                    verified = true;
                    return (true, requestAccepted);
                }

                attempts++;
                requestAccepted = TryRequestForeground(windowHandle, trace) || requestAccepted;

                if (trace.Measure("foregroundCheck", windowApi.GetForegroundWindow) == windowHandle)
                {
                    verified = true;
                    return (true, requestAccepted);
                }

                if (DateTimeOffset.UtcNow >= deadline)
                {
                    return (false, requestAccepted);
                }

                await trace.MeasureAsync(
                    "pollWait",
                    () => Task.Delay(5, cancellationToken)).ConfigureAwait(false);
            }
        }
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

    private bool TryRequestForeground(IntPtr windowHandle, TimingLog trace)
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
                attachedForeground = trace.Measure(
                    "attach",
                    () => windowApi.AttachThreadInput(threadIds.Current, threadIds.Foreground, true));
            }

            var requestAccepted = trace.Measure("set", () => windowApi.SetForegroundWindow(windowHandle));
            if (!requestAccepted)
            {
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
}
