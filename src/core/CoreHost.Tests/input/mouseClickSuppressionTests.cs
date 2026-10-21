using CoreHost.Input;

namespace CoreHost.Tests.Input;

public sealed class MouseClickSuppressionTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    public void blocksOnlyGameClicksAndConsumesTheirRelease(int button)
    {
        var focused = false;
        var input = new InputActivityTracker(gameFocused: () => focused);
        input.SuppressMouseClicks = true;
        Assert.False(input.suppressMouseClick(button, true, false));
        focused = true;
        Assert.False(input.suppressMouseClick(button, false, false));
        Assert.False(input.suppressMouseClick(0, true, false));
        Assert.False(input.suppressMouseClick(button, true, true));
        Assert.True(input.suppressMouseClick(button, true, false));
        input.SuppressMouseClicks = false;
        focused = false;
        Assert.True(input.suppressMouseClick(button, false, false));
        Assert.False(input.suppressMouseClick(button, true, false));
        focused = true;
        Assert.False(input.suppressMouseClick(button, true, false));
    }
}
