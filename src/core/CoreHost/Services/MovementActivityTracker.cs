using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class MovementActivityTracker
{
    private readonly TimeProvider _timeProvider;
    private readonly Func<int> _movingWindowMs;
    private long _lastMovementTimestamp;
    private int _available;

    public MovementActivityTracker(IOptionsMonitor<CoreHostOptions> options)
        : this(TimeProvider.System, () => options.CurrentValue.Movement.MovingWindowMs)
    {
    }

    public MovementActivityTracker() : this(TimeProvider.System)
    {
    }

    public MovementActivityTracker(TimeProvider timeProvider, int movingWindowMs = 400)
        : this(timeProvider, () => movingWindowMs)
    {
    }

    private MovementActivityTracker(TimeProvider timeProvider, Func<int> movingWindowMs)
    {
        _timeProvider = timeProvider;
        _movingWindowMs = movingWindowMs;
        _lastMovementTimestamp = timeProvider.GetTimestamp();
    }

    public bool IsAvailable => Volatile.Read(ref _available) == 1;

    public void MarkAvailable() => Volatile.Write(ref _available, 1);

    public void MarkUnavailable() => Volatile.Write(ref _available, 0);

    public void RecordKeyDown(int virtualKey, bool isInjected, bool gameIsForeground)
    {
        if (!IsMovementKey(virtualKey)) return;

        RecordPhysicalActivity(isInjected, gameIsForeground);
    }

    public void RecordMouseButtonDown(bool isInjected, bool gameIsForeground)
    {
        RecordPhysicalActivity(isInjected, gameIsForeground);
    }

    public TimeSpan GetIdleDuration()
    {
        return _timeProvider.GetElapsedTime(Interlocked.Read(ref _lastMovementTimestamp));
    }

    public MovementActivitySnapshot GetSnapshot()
    {
        var idleMs = (long)GetIdleDuration().TotalMilliseconds;
        return new MovementActivitySnapshot(
            IsAvailable,
            IsAvailable && idleMs < _movingWindowMs(),
            idleMs);
    }

    internal static bool IsMovementKey(int virtualKey)
    {
        return virtualKey is
            0x57 or 0x41 or 0x53 or 0x44 or 0x51 or 0x45 or 0x52 or 0x46 or
            0x54 or 0x59 or 0x55 or 0x4D or 0x4E or 0x43 or 0x58 or
            0xA2 or 0xA3 or 0x0D or 0x20 or 0xA0 or 0xA1;
    }

    private void RecordPhysicalActivity(bool isInjected, bool gameIsForeground)
    {
        if (isInjected || !gameIsForeground) return;

        Interlocked.Exchange(ref _lastMovementTimestamp, _timeProvider.GetTimestamp());
    }
}

public sealed record MovementActivitySnapshot(bool Available, bool IsMoving, long TimeSinceMovementMs);
