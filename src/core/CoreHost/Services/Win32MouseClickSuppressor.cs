using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading.Channels;
using CoreHost.Win32;

namespace CoreHost.Services;

public sealed class Win32MouseClickSuppressor(
    MouseClickSuppression mouseClicks,
    MovementActivityTracker movementActivity,
    GameProcessService gameProcess,
    IWindowApi windows,
    ILogger<Win32MouseClickSuppressor> logger) : IHostedService
{
    private readonly Channel<IntPtr> _activities = Channel.CreateBounded<IntPtr>(
        new BoundedChannelOptions(32)
        {
            SingleReader = true,
            SingleWriter = true,
            FullMode = BoundedChannelFullMode.DropOldest
        });
    private readonly TaskCompletionSource _started = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _stopped = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private NativeMethods.LowLevelMouseProc? _callback;
    private Task _processing = Task.CompletedTask;
    private Thread? _thread;
    private IntPtr _hook;
    private uint _threadId;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _processing = ProcessActivitiesAsync();
        _thread = new Thread(Run)
        {
            IsBackground = true,
            Name = "ChivAdmin mouse click suppressor"
        };
        _thread.Start();
        await _started.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        var threadId = Volatile.Read(ref _threadId);
        if (threadId != 0 && !NativeMethods.PostThreadMessage(
            threadId,
            NativeMethods.WM_QUIT,
            UIntPtr.Zero,
            IntPtr.Zero))
        {
            logger.LogWarning(
                "Could not stop the mouse click suppressor. Win32 error: {Error}.",
                Marshal.GetLastWin32Error());
        }

        await _stopped.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
        await _processing.WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    private void Run()
    {
        try
        {
            _threadId = NativeMethods.GetCurrentThreadId();
            NativeMethods.PeekMessage(out _, IntPtr.Zero, 0, 0, 0);
            _callback = HandleMouse;
            _hook = NativeMethods.SetWindowsHookEx(
                NativeMethods.WH_MOUSE_LL,
                _callback,
                NativeMethods.GetModuleHandle(null),
                0);
            if (_hook == IntPtr.Zero)
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "Could not start the mouse click suppressor.");
            }

            _started.TrySetResult();
            var messageResult = NativeMethods.GetMessage(out _, IntPtr.Zero, 0, 0);
            while (messageResult > 0)
            {
                messageResult = NativeMethods.GetMessage(out _, IntPtr.Zero, 0, 0);
            }

            if (messageResult < 0)
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "Mouse click suppression stopped unexpectedly.");
            }
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Mouse click suppression failed.");
            _started.TrySetException(exception);
        }
        finally
        {
            if (_hook != IntPtr.Zero)
            {
                NativeMethods.UnhookWindowsHookEx(_hook);
                _hook = IntPtr.Zero;
            }

            _threadId = 0;
            _activities.Writer.TryComplete();
            _stopped.TrySetResult();
        }
    }

    private IntPtr HandleMouse(int code, IntPtr message, IntPtr dataPointer)
    {
        if (code >= 0)
        {
            var data = Marshal.PtrToStructure<NativeMethods.MSLLHOOKSTRUCT>(dataPointer);
            if (IsPhysicalActivity(code, message, data.Flags))
            {
                _activities.Writer.TryWrite(windows.GetForegroundWindow());
            }
        }

        return mouseClicks.ShouldSuppress(code, message)
            ? new IntPtr(1)
            : NativeMethods.CallNextHookEx(_hook, code, message, dataPointer);
    }

    internal static bool IsPhysicalActivity(int code, IntPtr message, uint flags)
    {
        if (code < 0 || (flags & NativeMethods.LLMHF_INJECTED) != 0) return false;

        var value = unchecked((uint)message.ToInt64());
        return value is
            NativeMethods.WM_LBUTTONDOWN or
            NativeMethods.WM_RBUTTONDOWN or
            NativeMethods.WM_MBUTTONDOWN or
            NativeMethods.WM_XBUTTONDOWN;
    }

    private async Task ProcessActivitiesAsync()
    {
        await foreach (var foregroundWindow in _activities.Reader.ReadAllAsync().ConfigureAwait(false))
        {
            try
            {
                var target = gameProcess.GetTargetProcess();
                var gameIsForeground = target.Success &&
                    target.Process is not null &&
                    foregroundWindow == target.Process.WindowHandle;
                movementActivity.RecordMouseButtonDown(
                    isInjected: false,
                    gameIsForeground);
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Could not process mouse activity.");
            }
        }
    }
}
