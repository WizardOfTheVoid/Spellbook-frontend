using System.Runtime.InteropServices;
using CoreHost.Win32;

namespace CoreHost.Window;

public interface IWindowReadiness
{
    bool isReady(IntPtr handle);
    WindowReadinessSnapshot inspect(IntPtr handle)
    {
        var ready = isReady(handle);
        return new(ready, ready ? null : "WINDOW_NOT_READY");
    }
}

public sealed record WindowReadinessSnapshot(bool Ready, string? Reason = null, bool? GuiInfoAvailable = null,
    bool? Visible = null, bool? Minimized = null, bool? Enabled = null, bool? Foreground = null,
    bool? ActiveWindow = null, bool? FocusOwnerMatches = null, uint? GuiFlags = null, string? ActiveHandle = null, string? FocusHandle = null);

public sealed class NativeWindowReadiness(IWindowApi windows) : IWindowReadiness
{
    public bool isReady(IntPtr handle) => inspect(handle).Ready;

    public WindowReadinessSnapshot inspect(IntPtr handle)
    {
        var thread = windows.GetWindowThreadProcessId(handle, out var owner);
        var state = new GuiThreadInfo { Size = Marshal.SizeOf<GuiThreadInfo>() };
        var available = thread != 0 && GetGUIThreadInfo(thread, ref state);
        windows.GetWindowThreadProcessId(state.Focus, out var focusedOwner);
        var visible = windows.IsWindowVisible(handle);
        var minimized = windows.IsIconic(handle);
        var enabled = IsWindowEnabled(handle);
        var foreground = windows.GetForegroundWindow() == handle;
        var active = state.Active == handle;
        var focusOwned = state.Focus != IntPtr.Zero && owner == focusedOwner;
        var ready = available && evaluate(visible && !minimized, enabled, foreground && active, focusOwned, state.Flags);
        var reason = !available ? "GUI_INFO_UNAVAILABLE" : !visible ? "WINDOW_HIDDEN" : minimized ? "WINDOW_MINIMIZED" :
            !enabled ? "WINDOW_DISABLED" : !foreground ? "WINDOW_NOT_FOREGROUND" : !active ? "WINDOW_NOT_ACTIVE" :
            !focusOwned ? "FOCUS_OWNER_MISMATCH" : (state.Flags & 0x1E) != 0 ? "GUI_MODE_ACTIVE" : null;
        return new(ready, reason, available, visible, minimized, enabled, foreground, active, focusOwned, state.Flags,
            $"0x{state.Active.ToInt64():X}", $"0x{state.Focus.ToInt64():X}");
    }

    public static bool evaluate(bool visible, bool enabled, bool foreground, bool focused, uint flags) =>
        visible && enabled && foreground && focused && (flags & 0x1E) == 0;

    [StructLayout(LayoutKind.Sequential)]
    private struct GuiThreadInfo
    {
        public int Size;
        public uint Flags;
        public IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret;
        public int Left, Top, Right, Bottom;
    }
    [DllImport("user32.dll")]
    private static extern bool GetGUIThreadInfo(uint threadId, ref GuiThreadInfo info);
    [DllImport("user32.dll")]
    private static extern bool IsWindowEnabled(IntPtr window);
}
