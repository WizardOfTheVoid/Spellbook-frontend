using CoreHost.Input;

namespace CoreHost.Tests.Input;

public sealed class GameMouseIgnoreTests
{
    [Theory]
    [InlineData(false, false)]
    [InlineData(true, false)]
    [InlineData(false, true)]
    [InlineData(true, true)]
    public void movementAndClicksCanBeToggledIndependently(bool movement, bool clicks)
    {
        var input = tracker();
        input.ignoreMouseInGame(movement, clicks);

        Assert.Equal(movement, input.physicalMouse(0, false, false, movement: true));
        Assert.Equal(clicks, input.physicalMouse(1, true, false));
        Assert.Equal(clicks, input.physicalMouse(1, false, false));
        Assert.Equal(clicks, input.physicalMouse(0, false, false, wheel: true));
        Assert.False(input.physicalMouse(0, false, false));

        input.ignoreMouseInGame();
        Assert.False(input.physicalMouse(0, false, false, movement: true));
        Assert.False(input.physicalMouse(1, true, false));
    }

    [Fact]
    public void overlayAndOtherWindowsRemainUsableWhileGameIsForeground()
    {
        var input = tracker(target: (x, y) => x == 10 && y == 20);
        input.ignoreMouseInGame(movement: true, clicks: true);

        Assert.False(input.physicalMouse(0, false, false, 30, 40, movement: true));
        Assert.False(input.physicalMouse(1, true, false, 30, 40));
        Assert.False(input.physicalMouse(1, false, false, 30, 40));
        Assert.False(input.physicalMouse(0, false, false, 30, 40, wheel: true));
        Assert.True(input.physicalMouse(0, false, false, 10, 20, movement: true));
        Assert.True(input.physicalMouse(1, true, false, 10, 20));
    }

    [Fact]
    public void injectedMouseEventsPassThrough()
    {
        var input = tracker();
        input.ignoreMouseInGame(movement: true, clicks: true);

        Assert.False(input.physicalMouse(0, false, true, movement: true));
        Assert.False(input.physicalMouse(1, true, true));
        Assert.False(input.physicalMouse(0, false, true, wheel: true));
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(4)]
    [InlineData(5)]
    [InlineData(6)]
    public void swallowedDownKeepsItsReleasePairedAfterUnblocking(int button)
    {
        var focused = true;
        var input = tracker(focused: () => focused);
        input.ignoreMouseInGame(clicks: true);
        Assert.False(input.physicalMouse(button, false, false));
        Assert.True(input.physicalMouse(button, true, false));
        input.ignoreMouseInGame();
        focused = false;

        Assert.True(input.physicalMouse(button, false, false));
        Assert.False(input.physicalMouse(button, true, false));
    }

    [Fact]
    public void preexistingMouseHoldStillReceivesItsRelease()
    {
        var input = tracker();
        input.mouse(1, true, false);
        input.ignoreMouseInGame(clicks: true);

        Assert.False(input.physicalMouse(1, false, false));
    }

    [Fact]
    public void expiresAfterTwoSecondsWithoutRenewal()
    {
        var clock = new Clock();
        var input = tracker(clock);
        input.ignoreMouseInGame(movement: true, clicks: true);
        clock.Milliseconds = 1999;
        input.ignoreMouseInGame(movement: true, clicks: true);
        Assert.True(input.physicalMouse(0, false, false, movement: true));
        clock.Milliseconds = 2000;

        Assert.False(input.physicalMouse(0, false, false, movement: true));
        Assert.False(input.physicalMouse(1, true, false));
        Assert.False(input.mouseIgnoredInGame);
    }

    [Theory]
    [InlineData("focus")]
    [InlineData("monitor")]
    public void focusLossOrMonitorShutdownClearsTheToggle(string reason)
    {
        var focused = true;
        var input = tracker(focused: () => focused);
        input.ignoreMouseInGame(movement: true, clicks: true);
        if (reason == "focus") focused = false;
        else input.setAvailable(false);

        Assert.False(input.mouseIgnoredInGame);
        focused = true;
        input.setAvailable(true);
        Assert.False(input.physicalMouse(0, false, false, movement: true));
        Assert.False(input.physicalMouse(1, true, false));
    }

    [Fact]
    public void blockedGameClicksDoNotInterruptConsoleButHeldButtonsGateLaterWork()
    {
        var clock = new Clock { Milliseconds = 100 };
        var input = tracker(clock);
        input.ignoreMouseInGame(clicks: true);
        var ignored = input.physicalMouse(1, true, false);

        Assert.True(ignored);
        Assert.Contains(1, input.diagnostics().HeldButtons);
        Assert.False(input.snapshot(0).MouseActive);
        input.ignoreMouseInGame();
        Assert.True(input.snapshot(0).MouseActive);
        input.physicalMouse(1, false, false);
        Assert.False(input.snapshot(0).MouseActive);
    }

    [Fact]
    public async Task concurrentGateReadsNeverSeeHalfProcessedIgnoredClicks()
    {
        var input = tracker(new Clock());
        input.ignoreMouseInGame(clicks: true);
        using var start = new Barrier(2);
        var activeReads = 0;
        var events = Task.Run(() => {
            start.SignalAndWait();
            for (var index = 0; index < 10000; index++)
            {
                input.physicalMouse(1, true, false);
                input.physicalMouse(1, false, false);
            }
        }, TestContext.Current.CancellationToken);
        var snapshots = Task.Run(() => {
            start.SignalAndWait();
            for (var index = 0; index < 10000; index++)
                if (input.snapshot(0).MouseActive) activeReads++;
        }, TestContext.Current.CancellationToken);

        await Task.WhenAll(events, snapshots);

        Assert.Equal(0, activeReads);
        Assert.Empty(input.diagnostics().HeldButtons);
    }

    [Theory]
    [InlineData(false, true)]
    [InlineData(true, false)]
    public void cannotArmWithoutMonitoringAndGameFocus(bool available, bool focused)
    {
        var input = tracker(focused: () => focused);
        input.setAvailable(available);

        Assert.Throws<InputException>(() => input.ignoreMouseInGame(movement: true, clicks: true));
        Assert.False(input.mouseIgnoredInGame);
        input.ignoreMouseInGame();
    }

    private static InputActivityTracker tracker(TimeProvider? clock = null, Func<bool>? focused = null, Func<int, int, bool>? target = null)
    {
        var input = new InputActivityTracker(clock, gameFocused: focused ?? (() => true), gameMouseTarget: target ?? ((_, _) => true));
        input.setAvailable(true);
        return input;
    }

    private sealed class Clock : TimeProvider
    {
        internal long Milliseconds;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Milliseconds;
    }
}
