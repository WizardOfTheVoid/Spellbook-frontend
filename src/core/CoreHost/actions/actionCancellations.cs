namespace CoreHost.Actions;

internal sealed class ActionCancellations(Func<long>? clock = null, int capacity = 4096, int lifetimeMs = 600000)
{
    private readonly Dictionary<string, long> cancelled = new(StringComparer.Ordinal);
    private long now => clock?.Invoke() ?? Environment.TickCount64;

    public bool contains(string id)
    {
        expire();
        return cancelled.ContainsKey(id);
    }

    public void remember(string id)
    {
        expire();
        cancelled[id] = now + lifetimeMs;
        if (cancelled.Count > capacity) cancelled.Remove(cancelled.MinBy(item => item.Value).Key);
    }

    private void expire()
    {
        var timestamp = now;
        foreach (var entry in cancelled.Where(item => item.Value <= timestamp).ToArray()) cancelled.Remove(entry.Key);
    }
}
