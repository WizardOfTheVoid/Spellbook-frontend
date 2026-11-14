namespace CoreHost.Tests.KeyboardLayouts;

internal sealed class LayoutTestClock : TimeProvider
{
    private long timestamp;
    public override long TimestampFrequency => TimeSpan.TicksPerSecond;
    public override long GetTimestamp() => Interlocked.Read(ref timestamp);

    // Layout polling uses one-shot delays; advance them without waiting for the scheduler.
    public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
    {
        Interlocked.Add(ref timestamp, dueTime.Ticks);
        callback(state);
        return new Timer();
    }

    private sealed class Timer : ITimer
    {
        public bool Change(TimeSpan dueTime, TimeSpan period) => true;
        public void Dispose() { }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
