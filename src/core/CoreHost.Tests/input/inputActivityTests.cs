using CoreHost.Input;

namespace CoreHost.Tests.Input;

public sealed class InputActivityTests
{
    [Fact]
    public void outsideInputDoesNotResetGameTimersAndHeldKeysStillBlock()
    {
        var clock = new Clock();
        var focused = true;
        var tracker = new InputActivityTracker(clock, gameFocused: () => focused);
        tracker.setAvailable(true);
        tracker.key(13, true, false);
        tracker.key(13, false, false);
        focused = false;
        clock.Milliseconds = 1000;
        tracker.key(13, true, false);
        tracker.mouse(1, true, false);
        Assert.Equal(new InputSnapshot(false, false, false, 0, false, null, 0), tracker.gameSnapshot(0));
        Assert.True(tracker.snapshot(0).KeyboardActive);
        focused = true;
        var game = tracker.gameSnapshot(0);
        Assert.Equal(1000, game.IdleMs);
        Assert.Equal(1000, game.TimeSinceChattingMs);
        Assert.True(game.KeyboardActive);
        Assert.True(game.MouseActive);
        tracker.key(13, false, false);
        tracker.mouse(1, false, false);
        Assert.Equal(0, tracker.gameSnapshot(0).IdleMs);
        Assert.False(tracker.gameSnapshot(0).KeyboardActive);
        clock.Milliseconds = 2000;
        tracker.key(87, true, true);
        Assert.Equal(1000, tracker.gameSnapshot(0).IdleMs);
        tracker.setAvailable(false);
        Assert.False(tracker.gameSnapshot(0).Available);
    }

    private sealed class Clock : TimeProvider
    {
        internal long Milliseconds;
        public override long TimestampFrequency => 1000;
        public override long GetTimestamp() => Milliseconds;
    }

    [Theory]
    [InlineData(0x0D, false)]
    [InlineData(0x0D, true)]
    [InlineData(0xE8, false)]
    [InlineData(0xE8, true)]
    public void physicalEnterStartsChatTimer(int code, bool extended)
    {
        var tracker = new InputActivityTracker();
        tracker.physicalKey(code, 0x1C, true, false, extended);
        Assert.True(tracker.snapshot(0).IsChatting);
        Assert.Equal(new[] { code }, tracker.diagnostics().HeldKeys);
        tracker.physicalKey(code, 0x1C, false, false, extended);
        Assert.Empty(tracker.diagnostics().HeldKeys);
        Assert.True(tracker.snapshot(0).IsChatting);
    }

    [Theory]
    [InlineData(0x0D, false)]
    [InlineData(0x0D, true)]
    [InlineData(0xE8, false)]
    [InlineData(0xE8, true)]
    public void injectedEnterAndReleaseDoNotStartChatTimer(int code, bool extended)
    {
        var tracker = new InputActivityTracker();
        tracker.physicalKey(code, 0x1C, true, true, extended);
        tracker.physicalKey(code, 0x1C, false, false, extended);
        Assert.False(tracker.snapshot(0).IsChatting);
        Assert.Null(tracker.snapshot(0).TimeSinceChattingMs);
    }

    [Theory]
    [InlineData(0x09)]
    [InlineData(0x1B)]
    [InlineData(0x25)]
    [InlineData(0x70)]
    [InlineData(0x30)]
    [InlineData(0xA4)]
    public void wholeKeyboardBlocksUntilReleased(int key)
    {
        var tracker = new InputActivityTracker();
        tracker.setAvailable(true);
        tracker.key(key, true, false);
        Assert.True(tracker.snapshot(0).KeyboardActive);
        tracker.key(key, false, false);
        Assert.False(tracker.snapshot(0).KeyboardActive);
    }

    [Fact]
    public void physicalMouseHoldAndInjectedEventsAreDistinct()
    {
        var tracker = new InputActivityTracker();
        tracker.setAvailable(true);
        tracker.key(0x57, true, true);
        tracker.mouse(1, true, true);
        Assert.False(tracker.snapshot(0).KeyboardActive);
        Assert.False(tracker.snapshot(0).MouseActive);
        tracker.mouse(1, true, false);
        Assert.True(tracker.snapshot(0).MouseActive);
        tracker.mouse(1, false, false);
        Assert.False(tracker.snapshot(0).MouseActive);
    }

    [Fact]
    public void unavailableMonitorIsNotQuiet()
    {
        Assert.False(new InputActivityTracker().snapshot(0).Available);
    }

    [Fact]
    public void diagnosticsSeparateHeldPhysicalInputFromInjectedEventCounts()
    {
        var tracker = new InputActivityTracker();
        tracker.setAvailable(true);
        tracker.key(65, true, false);
        tracker.key(66, true, true);
        tracker.key(66, false, true);
        tracker.mouse(1, true, false);
        tracker.mouse(2, true, true);
        var snapshot = tracker.diagnostics();
        Assert.Equal(new[] { 65 }, snapshot.HeldKeys);
        Assert.Equal(new[] { 1 }, snapshot.HeldButtons);
        Assert.Equal(2, snapshot.InjectedKeyboardEvents);
        Assert.Equal(1, snapshot.InjectedMouseEvents);
        tracker.setAvailable(false);
        Assert.Empty(tracker.diagnostics().HeldKeys);
        Assert.Empty(tracker.diagnostics().HeldButtons);
    }
}
