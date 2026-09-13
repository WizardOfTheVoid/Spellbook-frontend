using System.Runtime.InteropServices;
using CoreHost.Win32;

namespace CoreHost.Input;

internal interface IPhysicalInputHooks
{
    void initialize(InputActivityTracker activity);
    bool processMessages(WaitHandle stopSignal);
    void release();
}

internal sealed class PhysicalInputHooks : IPhysicalInputHooks
{
    private InputActivityTracker activity = null!;
    private NativeMethods.LowLevelKeyboardProc? keyboardCallback;
    private NativeMethods.LowLevelMouseProc? mouseCallback;
    private IntPtr keyboardHook, mouseHook;

    public void initialize(InputActivityTracker tracker)
    {
        activity = tracker;
        NativeMethods.PeekMessage(out _, IntPtr.Zero, 0, 0, 0);
        keyboardCallback = keyboard;
        mouseCallback = mouse;
        keyboardHook = NativeMethods.SetWindowsHookEx(NativeMethods.WH_KEYBOARD_LL, keyboardCallback, NativeMethods.GetModuleHandle(null), 0);
        mouseHook = NativeMethods.SetWindowsHookEx(NativeMethods.WH_MOUSE_LL, mouseCallback, NativeMethods.GetModuleHandle(null), 0);
        if (keyboardHook == IntPtr.Zero || mouseHook == IntPtr.Zero)
            throw new InvalidOperationException($"Input monitoring could not start: {Marshal.GetLastWin32Error()}.");
        for (var key = 1; key <= 254; key++)
        {
            if (key is 3 or 16 or 17 or 18 || (GetAsyncKeyState(key) & 0x8000) == 0) continue;
            if (key is 1 or 2 or 4 or 5 or 6) activity.mouse(key, true, false);
            else activity.seedHeldKey(key);
        }
    }

    public bool processMessages(WaitHandle stopSignal)
    {
        var result = MsgWaitForMultipleObjects(1, [stopSignal.SafeWaitHandle.DangerousGetHandle()], false, uint.MaxValue, 0x04FF);
        if (result == 0) return false;
        if (result == uint.MaxValue) throw new InvalidOperationException($"Input message wait failed: {Marshal.GetLastWin32Error()}.");
        while (NativeMethods.PeekMessage(out var message, IntPtr.Zero, 0, 0, 1))
        {
            if (message.Message == NativeMethods.WM_QUIT || stopSignal.WaitOne(0)) return false;
        }
        return true;
    }

    public void release()
    {
        if (keyboardHook != IntPtr.Zero) NativeMethods.UnhookWindowsHookEx(keyboardHook);
        if (mouseHook != IntPtr.Zero) NativeMethods.UnhookWindowsHookEx(mouseHook);
    }

    private IntPtr keyboard(int code, IntPtr message, IntPtr pointer)
    {
        if (code >= 0)
        {
            var data = Marshal.PtrToStructure<NativeMethods.KBDLLHOOKSTRUCT>(pointer);
            var eventCode = (uint)message.ToInt64();
            if (eventCode is NativeMethods.WM_KEYDOWN or NativeMethods.WM_SYSKEYDOWN or NativeMethods.WM_KEYUP or NativeMethods.WM_SYSKEYUP)
                activity.physicalKey((int)data.VirtualKey, (int)data.ScanCode, eventCode is NativeMethods.WM_KEYDOWN or NativeMethods.WM_SYSKEYDOWN,
                    (data.Flags & NativeMethods.LLKHF_INJECTED) != 0, (data.Flags & 1) != 0);
        }
        return NativeMethods.CallNextHookEx(keyboardHook, code, message, pointer);
    }

    private IntPtr mouse(int code, IntPtr message, IntPtr pointer)
    {
        if (code >= 0)
        {
            var data = Marshal.PtrToStructure<NativeMethods.MSLLHOOKSTRUCT>(pointer);
            var eventCode = (uint)message.ToInt64();
            var button = eventCode switch
            {
                NativeMethods.WM_LBUTTONDOWN or NativeMethods.WM_LBUTTONUP => 1,
                NativeMethods.WM_RBUTTONDOWN or NativeMethods.WM_RBUTTONUP => 2,
                NativeMethods.WM_MBUTTONDOWN or NativeMethods.WM_MBUTTONUP => 4,
                NativeMethods.WM_XBUTTONDOWN or NativeMethods.WM_XBUTTONUP => (data.MouseData >> 16) == 1 ? 5 : 6,
                _ => 0
            };
            if (button != 0 || (data.Flags & NativeMethods.LLMHF_INJECTED) != 0) activity.mouse(button,
                eventCode is NativeMethods.WM_LBUTTONDOWN or NativeMethods.WM_RBUTTONDOWN or NativeMethods.WM_MBUTTONDOWN or NativeMethods.WM_XBUTTONDOWN,
                (data.Flags & NativeMethods.LLMHF_INJECTED) != 0);
        }
        return NativeMethods.CallNextHookEx(mouseHook, code, message, pointer);
    }

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint MsgWaitForMultipleObjects(uint count, IntPtr[] handles, bool waitAll, uint timeout, uint wakeMask);
}
