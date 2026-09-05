using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class MovementActivityTrackerTests
{
    [Fact]
    public void AlphabetAndDigitsOneThroughNineAreMovementKeys()
    {
        foreach (var virtualKey in "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789")
        {
            Assert.True(MovementActivityTracker.IsMovementKey(virtualKey));
        }

        foreach (var virtualKey in Enumerable.Range(0x61, 9))
        {
            Assert.True(MovementActivityTracker.IsMovementKey(virtualKey));
        }
    }

    [Theory]
    [InlineData(0xA2)]
    [InlineData(0xA3)]
    [InlineData(0x0D)]
    [InlineData(0x20)]
    [InlineData(0xA0)]
    [InlineData(0xA1)]
    public void PhysicalMovementKeyWhileGameIsForegroundResetsIdleTime(int virtualKey)
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time);
        time.Advance(TimeSpan.FromMinutes(3));

        tracker.RecordKeyDown(virtualKey, isInjected: false, gameIsForeground: true);

        Assert.Equal(TimeSpan.Zero, tracker.GetIdleDuration());
    }

    [Theory]
    [InlineData(0x57, true, true)]
    [InlineData(0x57, false, false)]
    [InlineData(0x30, false, true)]
    [InlineData(0x60, false, true)]
    public void NonPlayerMovementDoesNotResetIdleTime(
        int virtualKey,
        bool isInjected,
        bool gameIsForeground)
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time);
        tracker.MarkAvailable();
        time.Advance(TimeSpan.FromMinutes(3));

        tracker.RecordKeyDown(virtualKey, isInjected, gameIsForeground);
        time.Advance(TimeSpan.FromMinutes(1));

        Assert.Equal(TimeSpan.FromMinutes(4), tracker.GetIdleDuration());
        Assert.False(tracker.GetSnapshot().IsMoving);
    }

    [Fact]
    public void SnapshotReportsAvailabilityAndElapsedMovementTimeInMilliseconds()
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time);
        tracker.MarkAvailable();
        time.Advance(TimeSpan.FromMilliseconds(125_000));

        var snapshot = tracker.GetSnapshot();

        Assert.True(snapshot.Available);
        Assert.False(snapshot.IsMoving);
        Assert.Equal(125_000, snapshot.TimeSinceMovementMs);
    }

    [Fact]
    public void PhysicalMouseButtonWhileGameIsForegroundResetsIdleTime()
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time);
        time.Advance(TimeSpan.FromMinutes(3));

        tracker.RecordMouseButtonDown(isInjected: false, gameIsForeground: true);

        Assert.Equal(TimeSpan.Zero, tracker.GetIdleDuration());
    }

    [Theory]
    [InlineData(true, true)]
    [InlineData(false, false)]
    public void NonPhysicalGameMouseButtonDoesNotResetIdleTime(bool isInjected, bool gameIsForeground)
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time);
        time.Advance(TimeSpan.FromMinutes(3));

        tracker.RecordMouseButtonDown(isInjected, gameIsForeground);

        Assert.Equal(TimeSpan.FromMinutes(3), tracker.GetIdleDuration());
    }

    [Fact]
    public void MovingWindowEndsAtConfiguredBoundaryAfterRelease()
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time, movingWindowMs: 400);
        tracker.MarkAvailable();
        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        tracker.RecordKeyUp(0x57, isInjected: false, gameIsForeground: true);

        time.Advance(TimeSpan.FromMilliseconds(399));
        Assert.True(tracker.GetSnapshot().IsMoving);

        time.Advance(TimeSpan.FromMilliseconds(1));
        Assert.False(tracker.GetSnapshot().IsMoving);
    }

    [Fact]
    public void HeldKeyRemainsMovingPastTheConfiguredWindow()
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time, movingWindowMs: 400);
        tracker.MarkAvailable();

        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        time.Advance(TimeSpan.FromMinutes(1));

        Assert.True(tracker.GetSnapshot().IsMoving);
    }

    [Fact]
    public void ReleasingTheFinalHeldKeyStartsTheConfiguredMovingWindow()
    {
        var time = new ManualTimeProvider();
        const int movingWindowMs = 400;
        var tracker = new MovementActivityTracker(time, movingWindowMs);
        tracker.MarkAvailable();
        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        time.Advance(TimeSpan.FromMinutes(1));

        tracker.RecordKeyUp(0x57, isInjected: false, gameIsForeground: true);

        Assert.True(tracker.GetSnapshot().IsMoving);
        time.Advance(TimeSpan.FromMilliseconds(movingWindowMs));
        Assert.False(tracker.GetSnapshot().IsMoving);
    }

    [Fact]
    public void RepeatedKeyDownDoesNotRequireRepeatedKeyUp()
    {
        var time = new ManualTimeProvider();
        const int movingWindowMs = 400;
        var tracker = new MovementActivityTracker(time, movingWindowMs);
        tracker.MarkAvailable();

        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        tracker.RecordKeyUp(0x57, isInjected: false, gameIsForeground: true);
        time.Advance(TimeSpan.FromMilliseconds(movingWindowMs));

        Assert.False(tracker.GetSnapshot().IsMoving);
    }

    [Fact]
    public void ReleasingAKeyOutsideTheGameClearsItsHeldStateWithoutRecordingActivity()
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time, movingWindowMs: 400);
        tracker.MarkAvailable();
        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        time.Advance(TimeSpan.FromMinutes(1));

        tracker.RecordKeyUp(0x57, isInjected: false, gameIsForeground: false);

        Assert.False(tracker.GetSnapshot().IsMoving);
        Assert.Equal(TimeSpan.FromMinutes(1), tracker.GetIdleDuration());
    }

    [Fact]
    public void BecomingUnavailableClearsHeldKeys()
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time, movingWindowMs: 400);
        tracker.MarkAvailable();
        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        time.Advance(TimeSpan.FromMinutes(1));

        tracker.MarkUnavailable();
        tracker.MarkAvailable();

        Assert.False(tracker.GetSnapshot().IsMoving);
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private long _timestamp;

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public override long GetTimestamp() => _timestamp;

        public void Advance(TimeSpan duration) => _timestamp += duration.Ticks;
    }
}
