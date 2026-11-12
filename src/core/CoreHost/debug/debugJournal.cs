namespace CoreHost.Debug;

public sealed record DebugEvent(long Sequence, long TimeMs, string Kind, string Message,
    string? ActionId = null, int? CommandIndex = null, int? Slot = null);
public sealed record DebugEvents(long Sequence, IReadOnlyList<DebugEvent> Events, bool EventsLost);
public sealed record DebugExecution(string Phase, string? ActionId = null, int? CommandIndex = null);

public sealed class DebugJournal(Func<long>? clock = null, int capacity = 500)
{
    private readonly object sync = new();
    private readonly Queue<DebugEvent> events = new();
    private readonly Dictionary<string, string> observations = [];
    private long sequence;
    private DebugExecution current = new("idle");
    public DebugExecution execution { get { lock (sync) return current; } }

    public void record(string kind, string message, string? actionId = null, int? commandIndex = null, int? slot = null)
    {
        lock (sync)
        {
            events.Enqueue(new(++sequence, clock?.Invoke() ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), kind, message, actionId, commandIndex, slot));
            while (events.Count > Math.Max(1, capacity)) events.Dequeue();
        }
    }

    public void phase(string phase, string? actionId = null, int? commandIndex = null)
    {
        lock (sync)
        {
            var next = new DebugExecution(phase, actionId ?? current.ActionId, commandIndex ?? current.CommandIndex);
            if (phase == "idle") next = new(phase);
            if (current == next) return;
            current = next;
            record("phase", phase, next.ActionId, next.CommandIndex);
        }
    }

    public void observe(string key, string value)
    {
        lock (sync)
        {
            if (observations.TryGetValue(key, out var previous) && previous == value) return;
            observations[key] = value;
            record(key, value);
        }
    }

    public DebugEvents read(long after, long shortcutAfter = 0)
    {
        lock (sync) return new(sequence, events.Where(item => item.Sequence > after &&
            (item.Kind != "shortcut" || item.Sequence > shortcutAfter)).ToArray(),
            events.TryPeek(out var first) && after < first.Sequence - 1);
    }
}
