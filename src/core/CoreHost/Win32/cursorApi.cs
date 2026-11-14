using System.Runtime.InteropServices;

namespace CoreHost.Win32;

public interface ICursorApi
{
    uint? getFlags();
    IntPtr rootWindowAt(int x, int y);
}

public sealed class Win32CursorApi : ICursorApi
{
    public IntPtr rootWindowAt(int x, int y) => NativeMethods.GetAncestor(NativeMethods.WindowFromPhysicalPoint(new() { X = x, Y = y }), 2);

    public uint? getFlags()
    {
        var info = new NativeMethods.CURSORINFO { cbSize = (uint)Marshal.SizeOf<NativeMethods.CURSORINFO>() };
        return NativeMethods.GetCursorInfo(ref info) ? info.flags : null;
    }
}
