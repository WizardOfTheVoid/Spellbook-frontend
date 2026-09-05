using CoreHost.Services;
using CoreHost.Win32;

namespace CoreHost.Tests;

public sealed class MouseClickSuppressionTests
{
    [Theory]
    [InlineData(NativeMethods.WM_LBUTTONDOWN)]
    [InlineData(NativeMethods.WM_LBUTTONUP)]
    [InlineData(NativeMethods.WM_RBUTTONDOWN)]
    [InlineData(NativeMethods.WM_RBUTTONUP)]
    [InlineData(NativeMethods.WM_MBUTTONDOWN)]
    [InlineData(NativeMethods.WM_MBUTTONUP)]
    [InlineData(NativeMethods.WM_XBUTTONDOWN)]
    [InlineData(NativeMethods.WM_XBUTTONUP)]
    public void ActiveSuppressionEatsMouseButtonMessages(uint message)
    {
        var mouseClicks = new MouseClickSuppression();
        using var lease = mouseClicks.Suppress();

        Assert.True(mouseClicks.ShouldSuppress(0, new IntPtr(message)));
    }

    [Theory]
    [InlineData(NativeMethods.WM_MOUSEMOVE)]
    [InlineData(NativeMethods.WM_MOUSEWHEEL)]
    [InlineData(NativeMethods.WM_MOUSEHWHEEL)]
    public void ActiveSuppressionAllowsMouseMovementAndScrolling(uint message)
    {
        var mouseClicks = new MouseClickSuppression();
        using var lease = mouseClicks.Suppress();

        Assert.False(mouseClicks.ShouldSuppress(0, new IntPtr(message)));
    }

    [Fact]
    public void DisposingTheFinalLeaseRestoresMouseClicks()
    {
        var mouseClicks = new MouseClickSuppression();
        var first = mouseClicks.Suppress();
        var second = mouseClicks.Suppress();

        first.Dispose();
        Assert.True(mouseClicks.IsActive);

        second.Dispose();
        second.Dispose();
        Assert.False(mouseClicks.IsActive);
        Assert.False(mouseClicks.ShouldSuppress(0, new IntPtr(NativeMethods.WM_LBUTTONDOWN)));
    }

    [Fact]
    public void NegativeHookCodeAlwaysPassesThrough()
    {
        var mouseClicks = new MouseClickSuppression();
        using var lease = mouseClicks.Suppress();

        Assert.False(mouseClicks.ShouldSuppress(-1, new IntPtr(NativeMethods.WM_LBUTTONDOWN)));
    }

    [Theory]
    [InlineData(NativeMethods.WM_LBUTTONDOWN)]
    [InlineData(NativeMethods.WM_RBUTTONDOWN)]
    [InlineData(NativeMethods.WM_MBUTTONDOWN)]
    [InlineData(NativeMethods.WM_XBUTTONDOWN)]
    public void PhysicalButtonDownIsMovementActivity(uint message)
    {
        Assert.True(Win32MouseClickSuppressor.IsPhysicalActivity(
            code: 0,
            new IntPtr(message),
            flags: 0));
    }

    [Theory]
    [InlineData(NativeMethods.WM_LBUTTONUP)]
    [InlineData(NativeMethods.WM_RBUTTONUP)]
    [InlineData(NativeMethods.WM_MBUTTONUP)]
    [InlineData(NativeMethods.WM_XBUTTONUP)]
    [InlineData(NativeMethods.WM_MOUSEMOVE)]
    [InlineData(NativeMethods.WM_MOUSEWHEEL)]
    [InlineData(NativeMethods.WM_MOUSEHWHEEL)]
    public void NonButtonDownMouseInputIsNotMovementActivity(uint message)
    {
        Assert.False(Win32MouseClickSuppressor.IsPhysicalActivity(
            code: 0,
            new IntPtr(message),
            flags: 0));
    }

    [Fact]
    public void InjectedOrNegativeHookMouseInputIsNotMovementActivity()
    {
        Assert.False(Win32MouseClickSuppressor.IsPhysicalActivity(
            code: 0,
            new IntPtr(NativeMethods.WM_LBUTTONDOWN),
            NativeMethods.LLMHF_INJECTED));
        Assert.False(Win32MouseClickSuppressor.IsPhysicalActivity(
            code: -1,
            new IntPtr(NativeMethods.WM_LBUTTONDOWN),
            flags: 0));
    }
}
