using CoreHost.Models;

namespace CoreHost.KeyboardLayouts;

public sealed record KeyboardLayoutInfo(string Id, string DisplayName);
public sealed record GameKeyboardLayout(int ProcessId, IntPtr WindowHandle, uint ThreadId, string LayoutId, IntPtr RuntimeHandle);
public sealed record KeyboardLayoutFault(string Code, string Message);
public sealed class KeyboardLayoutException(string code, string message) : Exception(message)
{
    public string code { get; } = code;
}

public interface IKeyboardLayoutApi
{
    IReadOnlyList<KeyboardLayoutInfo> getInstalled();
    GameKeyboardLayout read(GameProcessInfo game);
    void request(GameKeyboardLayout owner, string layoutId);
}

public interface IKeyboardLayoutPlatform
{
    IntPtr[] handles();
    IReadOnlyDictionary<IntPtr, KeyboardLayoutInfo> resolve(IntPtr[] handles);
    uint thread(IntPtr window, out uint processId);
    IntPtr activeLayout(uint threadId);
    bool post(IntPtr window, IntPtr handle);
}
