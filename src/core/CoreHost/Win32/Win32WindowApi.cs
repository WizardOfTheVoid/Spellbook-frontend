namespace CoreHost.Win32;

public sealed class Win32WindowApi : IWindowApi
{
    public IntPtr GetForegroundWindow() => NativeMethods.GetForegroundWindow();

    public bool SetForegroundWindow(IntPtr windowHandle) => NativeMethods.SetForegroundWindow(windowHandle);

    public bool BringWindowToTop(IntPtr windowHandle) => NativeMethods.BringWindowToTop(windowHandle);

    public bool AttachThreadInput(uint attachThreadId, uint attachToThreadId, bool attach) =>
        NativeMethods.AttachThreadInput(attachThreadId, attachToThreadId, attach);

    public bool IsIconic(IntPtr windowHandle) => NativeMethods.IsIconic(windowHandle);

    public bool ShowWindow(IntPtr windowHandle, int command) => NativeMethods.ShowWindow(windowHandle, command);

    public bool IsWindow(IntPtr windowHandle) => NativeMethods.IsWindow(windowHandle);

    public bool IsWindowVisible(IntPtr windowHandle) => NativeMethods.IsWindowVisible(windowHandle);

    public uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId) =>
        NativeMethods.GetWindowThreadProcessId(windowHandle, out processId);

    public uint GetCurrentThreadId() => NativeMethods.GetCurrentThreadId();
}
