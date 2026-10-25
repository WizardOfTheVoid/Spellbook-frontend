namespace CoreHost.Debug;

public sealed class DebugShortcuts(DebugJournal journal, Func<bool> gameFocused, Func<long>? clock = null, int leaseMs = 2000)
{
    private readonly object sync = new();
    private readonly HashSet<int> held = [];
    private bool enabled;
    private long lastHeartbeat, shortcutAfter;
    private long now => clock?.Invoke() ?? Environment.TickCount64;

    public bool armed { get { lock (sync) { expire(); return enabled; } } }

    public void setEnabled(bool value)
    {
        lock (sync)
        {
            expire();
            if (enabled != value)
            {
                shortcutAfter = journal.read(long.MaxValue).Sequence;
                enabled = value;
                journal.record("session", value ? "armed" : "disarmed");
            }
            lastHeartbeat = now;
        }
    }

    public bool heartbeat()
    {
        lock (sync)
        {
            expire();
            if (enabled) lastHeartbeat = now;
            return enabled;
        }
    }

    public DebugEvents events(long after)
    {
        lock (sync)
        {
            expire();
            return journal.read(after, enabled ? shortcutAfter : long.MaxValue);
        }
    }

    public void key(int scanCode, bool down, bool injected, bool extended)
    {
        if (injected || extended) return;
        var slot = scanCode switch { 0x4F => 1, 0x50 => 2, 0x51 => 3, 0x4B => 4, _ => 0 };
        if (slot == 0) return;
        lock (sync)
        {
            expire();
            if (!down) { held.Remove(scanCode); return; }
            if (held.Add(scanCode) && enabled && gameFocused()) journal.record("shortcut", $"Numpad {slot}", slot: slot);
        }
    }

    public void seedHeldKey(int virtualKey)
    {
        var scanCode = virtualKey switch
        {
            0x61 or 0x23 => 0x4F, 0x62 or 0x28 => 0x50,
            0x63 or 0x22 => 0x51, 0x64 or 0x25 => 0x4B, _ => 0
        };
        if (scanCode != 0) lock (sync) held.Add(scanCode);
    }

    private void expire()
    {
        if (!enabled || now - lastHeartbeat < leaseMs) return;
        enabled = false;
        shortcutAfter = journal.read(long.MaxValue).Sequence;
        journal.record("session", "heartbeat_expired");
    }
}
