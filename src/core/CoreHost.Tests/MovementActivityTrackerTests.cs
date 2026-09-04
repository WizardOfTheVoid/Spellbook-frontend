using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class MovementActivityTrackerTests
{
    [Theory]
    [InlineData(0x57)]
    [InlineData(0x41)]
    [InlineData(0x53)]
    [InlineData(0x44)]
    [InlineData(0x51)]
    [InlineData(0x45)]
    [InlineData(0x52)]
    [InlineData(0x46)]
    [InlineData(0x54)]
    [InlineData(0x59)]
    [InlineData(0x55)]
    [InlineData(0x4D)]
    [InlineData(0x4E)]
    [InlineData(0x43)]
    [InlineData(0x58)]
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
    [InlineData(0x42, false, true)]
    public void NonPlayerMovementDoesNotResetIdleTime(
        int virtualKey,
        bool isInjected,
        bool gameIsForeground)
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time);
        time.Advance(TimeSpan.FromMinutes(3));

        tracker.RecordKeyDown(virtualKey, isInjected, gameIsForeground);
        time.Advance(TimeSpan.FromMinutes(1));

        Assert.Equal(TimeSpan.FromMinutes(4), tracker.GetIdleDuration());
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
    public void MovingWindowEndsAtConfiguredBoundary()
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time, movingWindowMs: 400);
        tracker.MarkAvailable();
        tracker.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);

        time.Advance(TimeSpan.FromMilliseconds(399));
        Assert.True(tracker.GetSnapshot().IsMoving);

        time.Advance(TimeSpan.FromMilliseconds(1));
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
