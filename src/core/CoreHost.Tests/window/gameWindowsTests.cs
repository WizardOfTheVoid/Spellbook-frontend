using CoreHost.Window;

namespace CoreHost.Tests.Window;

public sealed class GameWindowsTests
{
    [Theory]
    [InlineData(true, true, true, true, 0, true)]
    [InlineData(false, true, true, true, 0, false)]
    [InlineData(true, false, true, true, 0, false)]
    [InlineData(true, true, false, true, 0, false)]
    [InlineData(true, true, true, false, 0, false)]
    [InlineData(true, true, true, true, 4, false)]
    [InlineData(true, true, true, true, 2, false)]
    public void readinessRequiresVerifiedNativeInputState(bool visible, bool enabled, bool foreground,
        bool focused, uint flags, bool expected)
    {
        Assert.Equal(expected, NativeWindowReadiness.evaluate(visible, enabled, foreground, focused, flags));
    }
}
