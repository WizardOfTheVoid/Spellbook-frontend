using System.Runtime.InteropServices;

namespace CoreHost.Win32;

public interface ICursorApi
{
    uint? getFlags();
}

public sealed class Win32CursorApi : ICursorApi
{
    public uint? getFlags()
    {
        var info = new NativeMethods.CURSORINFO { cbSize = (uint)Marshal.SizeOf<NativeMethods.CURSORINFO>() };
        return NativeMethods.GetCursorInfo(ref info) ? info.flags : null;
    }
}
