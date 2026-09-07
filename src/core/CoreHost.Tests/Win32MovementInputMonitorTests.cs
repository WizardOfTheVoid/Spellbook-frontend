using CoreHost.Services;
using CoreHost.Win32;

namespace CoreHost.Tests;

public sealed class Win32MovementInputMonitorTests
{
    [Theory]
    [InlineData(NativeMethods.WM_KEYDOWN, true)]
    [InlineData(NativeMethods.WM_SYSKEYDOWN, true)]
    [InlineData(NativeMethods.WM_KEYUP, false)]
    [InlineData(NativeMethods.WM_SYSKEYUP, false)]
    public void PhysicalKeyboardMessagesExposeKeyStateChanges(uint message, bool expectedKeyDown)
    {
        var found = Win32MovementInputMonitor.TryGetKeyStateChange(
            code: 0,
            new IntPtr(message),
            flags: 0,
            out var isKeyDown);

        Assert.True(found);
        Assert.Equal(expectedKeyDown, isKeyDown);
    }

    [Theory]
    [InlineData(-1, NativeMethods.WM_KEYDOWN, 0)]
    [InlineData(0, NativeMethods.WM_KEYDOWN, NativeMethods.LLKHF_INJECTED)]
    [InlineData(0, NativeMethods.WM_QUIT, 0)]
    public void NonPhysicalKeyboardMessagesDoNotExposeKeyStateChanges(
        int code,
        uint message,
        uint flags)
    {
        Assert.False(Win32MovementInputMonitor.TryGetKeyStateChange(
            code,
            new IntPtr(message),
            flags,
            out _));
    }
}
