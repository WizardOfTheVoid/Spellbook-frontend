namespace CoreHost.Win32;

public interface IWindowApi
{
    IntPtr GetForegroundWindow();
    bool SetForegroundWindow(IntPtr windowHandle);
    bool BringWindowToTop(IntPtr windowHandle);
    bool AttachThreadInput(uint attachThreadId, uint attachToThreadId, bool attach);
    bool IsIconic(IntPtr windowHandle);
    bool ShowWindow(IntPtr windowHandle, int command);
    bool IsWindow(IntPtr windowHandle);
    bool IsWindowVisible(IntPtr windowHandle);
    uint GetWindowThreadProcessId(IntPtr windowHandle, out uint processId);
    uint GetCurrentThreadId();
}
