using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class MovementActivityTracker
{
    private readonly TimeProvider _timeProvider;
    private readonly Func<int> _movingWindowMs;
    private readonly Func<int> _chatCooldownMs;
    private readonly HashSet<int> _heldMovementKeys = [];
    private long _lastMovementTimestamp;
    private long? _lastChatTimestamp;
    private int _available;

    public MovementActivityTracker(IOptionsMonitor<CoreHostOptions> options)
        : this(TimeProvider.System, () => options.CurrentValue.Movement.MovingWindowMs,
            () => options.CurrentValue.Movement.ChatCooldownMs)
    {
    }

    public MovementActivityTracker() : this(TimeProvider.System)
    {
    }

    public MovementActivityTracker(TimeProvider timeProvider, int movingWindowMs = 400, int chatCooldownMs = 25000)
        : this(timeProvider, () => movingWindowMs, () => chatCooldownMs)
    {
    }

    private MovementActivityTracker(TimeProvider timeProvider, Func<int> movingWindowMs, Func<int> chatCooldownMs)
    {
        _timeProvider = timeProvider;
        _movingWindowMs = movingWindowMs;
        _chatCooldownMs = chatCooldownMs;
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
            if (virtualKey is 0x59 or 0x55 or 0x0D)
                _lastChatTimestamp = _timeProvider.GetTimestamp();
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
        lock (_heldMovementKeys)
        {
            var idleMs = (long)GetIdleDuration().TotalMilliseconds;
            var chatIdleMs = timeSinceChatting();
            var chatRemainingMs = chatIdleMs.HasValue ? Math.Max(0, _chatCooldownMs() - chatIdleMs.Value) : 0;
            return new MovementActivitySnapshot(
                IsAvailable,
                IsAvailable && (_heldMovementKeys.Count > 0 || idleMs < _movingWindowMs()),
                idleMs,
                chatRemainingMs > 0,
                chatIdleMs,
                chatRemainingMs);
        }
    }

    public bool isChatting() => timeSinceChatting() is long elapsed && elapsed < _chatCooldownMs();

    public long? timeSinceChatting()
    {
        lock (_heldMovementKeys)
        {
            return _lastChatTimestamp.HasValue
                ? (long)_timeProvider.GetElapsedTime(_lastChatTimestamp.Value).TotalMilliseconds
                : null;
        }
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

public sealed record MovementActivitySnapshot(
    bool Available, bool IsMoving, long TimeSinceMovementMs,
    bool IsChatting, long? TimeSinceChattingMs, long ChatCooldownRemainingMs);
