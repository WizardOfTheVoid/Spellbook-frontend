using System.ComponentModel;
using System.Runtime.InteropServices;
using CoreHost.Win32;

namespace CoreHost.Services;

public sealed class Win32MovementInputMonitor(
    MovementActivityTracker movementActivity,
    GameProcessService gameProcess,
    IWindowApi windows,
    ILogger<Win32MovementInputMonitor> logger) : IHostedService
{
    private readonly MovementKeyStateQueue _movements = new();
    private readonly TaskCompletionSource _started = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource _stopped = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private NativeMethods.LowLevelKeyboardProc? _callback;
    private Task _processing = Task.CompletedTask;
    private Thread? _thread;
    private IntPtr _hook;
    private uint _threadId;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        _processing = ProcessMovementsAsync();
        _thread = new Thread(Run)
        {
            IsBackground = true,
            Name = "ChivAdmin movement input monitor"
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
                "Could not stop the movement input monitor. Win32 error: {Error}.",
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
            _callback = HandleKeyboard;
            _hook = NativeMethods.SetWindowsHookEx(
                NativeMethods.WH_KEYBOARD_LL,
                _callback,
                NativeMethods.GetModuleHandle(null),
                0);
            if (_hook == IntPtr.Zero)
            {
                throw new Win32Exception(
                    Marshal.GetLastWin32Error(),
                    "Could not start the movement input monitor.");
            }

            movementActivity.MarkAvailable();
            _started.TrySetResult();
            var messageResult = NativeMethods.GetMessage(out _, IntPtr.Zero, 0, 0);
            while (messageResult > 0)
            {
                messageResult = NativeMethods.GetMessage(out _, IntPtr.Zero, 0, 0);
            }

            if (messageResult < 0)
            {
                logger.LogError(
                    "Movement input monitoring stopped unexpectedly. Win32 error: {Error}.",
                    Marshal.GetLastWin32Error());
            }
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Movement input monitoring failed.");
            _started.TrySetResult();
        }
        finally
        {
            movementActivity.MarkUnavailable();
            if (_hook != IntPtr.Zero)
            {
                NativeMethods.UnhookWindowsHookEx(_hook);
                _hook = IntPtr.Zero;
            }

            _movements.Complete();
            _threadId = 0;
            _stopped.TrySetResult();
        }
    }

    private IntPtr HandleKeyboard(int code, IntPtr message, IntPtr dataPointer)
    {
        if (code >= 0)
        {
            var data = Marshal.PtrToStructure<NativeMethods.KBDLLHOOKSTRUCT>(dataPointer);
            if (TryGetKeyStateChange(code, message, data.Flags, out var isKeyDown) &&
                MovementActivityTracker.IsMovementKey((int)data.VirtualKey))
            {
                _movements.TryWrite(new MovementKeyStateChange(
                    (int)data.VirtualKey,
                    isKeyDown,
                    windows.GetForegroundWindow()));
            }
        }

        return NativeMethods.CallNextHookEx(_hook, code, message, dataPointer);
    }

    internal static bool TryGetKeyStateChange(
        int code,
        IntPtr message,
        uint flags,
        out bool isKeyDown)
    {
        isKeyDown = false;
        if (code < 0 || (flags & NativeMethods.LLKHF_INJECTED) != 0) return false;

        var value = unchecked((uint)message.ToInt64());
        if (value is NativeMethods.WM_KEYDOWN or NativeMethods.WM_SYSKEYDOWN)
        {
            isKeyDown = true;
            return true;
        }

        return value is NativeMethods.WM_KEYUP or NativeMethods.WM_SYSKEYUP;
    }

    private async Task ProcessMovementsAsync()
    {
        await foreach (var movement in _movements.ReadAllAsync().ConfigureAwait(false))
        {
            try
            {
                var target = gameProcess.GetTargetProcess();
                var gameIsForeground = target.Success &&
                    target.Process is not null &&
                    movement.ForegroundWindow == target.Process.WindowHandle;
                if (movement.IsKeyDown)
                {
                    movementActivity.RecordKeyDown(
                        movement.VirtualKey,
                        isInjected: false,
                        gameIsForeground);
                }
                else
                {
                    movementActivity.RecordKeyUp(
                        movement.VirtualKey,
                        isInjected: false,
                        gameIsForeground);
                }
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Could not process movement input.");
            }
        }
    }
}
