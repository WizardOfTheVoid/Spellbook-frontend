using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class MovementActivityTracker
{
    private readonly TimeProvider _timeProvider;
    private readonly Func<int> _movingWindowMs;
    private readonly HashSet<int> _heldMovementKeys = [];
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

    public void MarkUnavailable()
    {
        lock (_heldMovementKeys)
        {
            _heldMovementKeys.Clear();
        }

        Volatile.Write(ref _available, 0);
    }

    public void RecordKeyDown(int virtualKey, bool isInjected, bool gameIsForeground)
    {
        if (!IsMovementKey(virtualKey) || isInjected || !gameIsForeground) return;

        lock (_heldMovementKeys)
        {
            _heldMovementKeys.Add(virtualKey);
        }

        RecordActivity();
    }

    public void RecordKeyUp(int virtualKey, bool isInjected, bool gameIsForeground)
    {
        if (!IsMovementKey(virtualKey) || isInjected) return;

        lock (_heldMovementKeys)
        {
            if (!_heldMovementKeys.Remove(virtualKey)) return;
            if (gameIsForeground) RecordActivity();
        }
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
        long idleMs;
        bool hasHeldKey;
        lock (_heldMovementKeys)
        {
            idleMs = (long)GetIdleDuration().TotalMilliseconds;
            hasHeldKey = _heldMovementKeys.Count > 0;
        }

        return new MovementActivitySnapshot(
            IsAvailable,
            IsAvailable && (hasHeldKey || idleMs < _movingWindowMs()),
            idleMs);
    }

    internal static bool IsMovementKey(int virtualKey)
    {
        if (virtualKey is
            >= 0x41 and <= 0x5A or
            >= 0x31 and <= 0x39 or
            >= 0x61 and <= 0x69)
        {
            return true;
        }

        return virtualKey is
            0xA2 or 0xA3 or 0x0D or 0x20 or 0xA0 or 0xA1;
    }

    private void RecordPhysicalActivity(bool isInjected, bool gameIsForeground)
    {
        if (isInjected || !gameIsForeground) return;

        RecordActivity();
    }

    private void RecordActivity()
        => Interlocked.Exchange(ref _lastMovementTimestamp, _timeProvider.GetTimestamp());
}

public sealed record MovementActivitySnapshot(bool Available, bool IsMoving, long TimeSinceMovementMs);
