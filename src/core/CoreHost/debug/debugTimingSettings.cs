using System.Globalization;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Debug;

public sealed class DebugTimingSettings : IOptionsMonitor<CoreHostOptions>, IDisposable
{
    private sealed record Timing(Func<CoreHostOptions, int> Get, Action<CoreHostOptions, int> Set, int Min = 0, int Max = 120000);
    private static readonly Dictionary<string, Timing> allowed = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Window__FocusTimeoutMs"] = new(o => o.Window.FocusTimeoutMs, (o, v) => o.Window.FocusTimeoutMs = v, 1),
        ["Window__FocusSettleMs"] = new(o => o.Window.FocusSettleMs, (o, v) => o.Window.FocusSettleMs = v),
        ["Window__RestoreSettleMs"] = new(o => o.Window.RestoreSettleMs, (o, v) => o.Window.RestoreSettleMs = v),
        ["Window__ProcessPollMs"] = new(o => o.Window.ProcessPollMs, (o, v) => o.Window.ProcessPollMs = v, 1),
        ["QUEUE_GATE_NORMAL"] = new(o => o.QueueGateNormal, (o, v) => o.QueueGateNormal = v),
        ["QUEUE_GATE_LOW"] = new(o => o.QueueGateLow, (o, v) => o.QueueGateLow = v),
        ["QUEUE_GATE_HIGH"] = new(o => o.QueueGateHigh, (o, v) => o.QueueGateHigh = v),
        ["Input__SubmitSettleMs"] = new(o => o.Input.SubmitSettleMs, (o, v) => o.Input.SubmitSettleMs = v),
        ["Input__ChatCooldownMs"] = new(o => o.Input.ChatCooldownMs, (o, v) => o.Input.ChatCooldownMs = v, 1),
        ["Queue__UserActionTtlMs"] = new(o => o.Queue.UserActionTtlMs, (o, v) => o.Queue.UserActionTtlMs = v, 1, 600000),
        ["Queue__SystemActionTtlMs"] = new(o => o.Queue.SystemActionTtlMs, (o, v) => o.Queue.SystemActionTtlMs = v, 1, 600000),
        ["Queue__CommandTimeoutMs"] = new(o => o.Queue.CommandTimeoutMs, (o, v) => o.Queue.CommandTimeoutMs = v, 1),
        ["Queue__RecheckMs"] = new(o => o.Queue.RecheckMs, (o, v) => o.Queue.RecheckMs = v, 1, 5000),
        ["Clipboard__OutputTimeoutMs"] = new(o => o.Clipboard.OutputTimeoutMs, (o, v) => o.Clipboard.OutputTimeoutMs = v, 1),
        ["Clipboard__PollMs"] = new(o => o.Clipboard.PollMs, (o, v) => o.Clipboard.PollMs = v, 1, 5000)
    };
    private readonly object sync = new();
    private readonly string? envPath;
    private readonly DebugJournal? journal;
    private readonly IDisposable? subscription;
    private readonly List<Action<CoreHostOptions, string?>> listeners = [];
    private CoreHostOptions saved, current;
    private Dictionary<string, double> overrides = new(StringComparer.OrdinalIgnoreCase);

    public DebugTimingSettings(IOptionsMonitor<CoreHostOptions> source, string? envPath, DebugJournal? journal = null)
    {
        this.envPath = envPath;
        this.journal = journal;
        saved = current = source.CurrentValue;
        subscription = source.OnChange((value, _) =>
        {
            lock (sync) { saved = value; publish(apply(value, overrides)); }
        });
    }

    public CoreHostOptions CurrentValue => Volatile.Read(ref current);
    public CoreHostOptions Get(string? name) => CurrentValue;
    public IDisposable OnChange(Action<CoreHostOptions, string?> listener)
    {
        lock (sync) listeners.Add(listener);
        return new Listener(() => { lock (sync) listeners.Remove(listener); });
    }
    public void Dispose() => subscription?.Dispose();
    public IReadOnlyDictionary<string, int> snapshot()
    {
        var value = CurrentValue;
        return allowed.ToDictionary(item => item.Key, item => item.Value.Get(value));
    }

    public void update(IReadOnlyDictionary<string, double>? values = null, bool save = false, bool reset = false)
    {
        lock (sync)
        {
            if (reset && (save || values is { Count: > 0 })) throw new ArgumentException("Reset cannot be combined with values or save.");
            if (values is not null)
                foreach (var (key, value) in values)
                    if (!allowed.TryGetValue(key, out var timing) || !double.IsFinite(value) || value != Math.Truncate(value) || value < timing.Min || value > timing.Max)
                        throw new ArgumentException($"Unsupported timing key or value: {key}.");
            var nextOverrides = reset ? new(StringComparer.OrdinalIgnoreCase) : new Dictionary<string, double>(overrides, StringComparer.OrdinalIgnoreCase);
            if (values is not null) foreach (var item in values) nextOverrides[item.Key] = item.Value;
            var next = apply(saved, nextOverrides);
            if (save)
            {
                if (envPath is null) throw new InvalidOperationException("The active Core .env path is unavailable.");
                saveFile(next);
                saved = next;
                nextOverrides.Clear();
            }
            overrides = nextOverrides;
            publish(next);
            journal?.record("settings", reset ? "reset" : save ? "saved" : "overridden");
        }
    }

    private void publish(CoreHostOptions value)
    {
        Volatile.Write(ref current, value);
        foreach (var listener in listeners.ToArray()) listener(value, Microsoft.Extensions.Options.Options.DefaultName);
    }

    private static CoreHostOptions apply(CoreHostOptions source, IReadOnlyDictionary<string, double> values)
    {
        var result = new CoreHostOptions
        {
            Core = source.Core, Process = source.Process, Snapshot = source.Snapshot, Debug = source.Debug,
            QueueGateNormal = source.QueueGateNormal, QueueGateLow = source.QueueGateLow, QueueGateHigh = source.QueueGateHigh,
            Window = new() { FocusTimeoutMs = source.Window.FocusTimeoutMs, FocusSettleMs = source.Window.FocusSettleMs,
                RestoreSettleMs = source.Window.RestoreSettleMs, ProcessPollMs = source.Window.ProcessPollMs },
            Input = new() { SubmitSettleMs = source.Input.SubmitSettleMs, ChatCooldownMs = source.Input.ChatCooldownMs },
            Queue = new() { UserActionTtlMs = source.Queue.UserActionTtlMs, SystemActionTtlMs = source.Queue.SystemActionTtlMs,
                CommandTimeoutMs = source.Queue.CommandTimeoutMs,
                RecheckMs = source.Queue.RecheckMs, MaxPendingActions = source.Queue.MaxPendingActions },
            Clipboard = new() { OutputTimeoutMs = source.Clipboard.OutputTimeoutMs, PollMs = source.Clipboard.PollMs }
        };
        foreach (var (key, value) in values) allowed[key].Set(result, (int)value);
        return result;
    }

    private void saveFile(CoreHostOptions options)
    {
        var text = File.Exists(envPath) ? File.ReadAllText(envPath) : string.Empty;
        var newline = text.Contains("\r\n") ? "\r\n" : "\n";
        var lines = text.Split(newline).ToList();
        var remaining = allowed.Keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < lines.Count; index++)
        {
            var line = lines[index];
            var equals = line.IndexOf('=');
            if (equals < 0) continue;
            var key = line[..equals].Trim();
            if (key.StartsWith("export ", StringComparison.OrdinalIgnoreCase)) key = key[7..].TrimStart();
            if (!allowed.TryGetValue(key, out var timing)) continue;
            lines[index] = line[..(equals + 1)] + timing.Get(options).ToString(CultureInfo.InvariantCulture);
            remaining.Remove(key);
        }
        if (lines.Count > 0 && lines[^1] == string.Empty) lines.RemoveAt(lines.Count - 1);
        foreach (var key in remaining) lines.Add($"{key}={allowed[key].Get(options).ToString(CultureInfo.InvariantCulture)}");
        var temporary = $"{envPath}.{Guid.NewGuid():N}.tmp";
        try
        {
            File.WriteAllText(temporary, string.Join(newline, lines) + newline);
            File.Move(temporary, envPath!, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    private sealed class Listener(Action unsubscribe) : IDisposable { public void Dispose() => unsubscribe(); }
}
