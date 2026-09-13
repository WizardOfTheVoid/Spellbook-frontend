using CoreHost.Debug;

namespace CoreHost.Input;

public sealed class InputActivityTracker(TimeProvider? timeProvider = null, DebugJournal? journal = null, DebugShortcuts? shortcuts = null,
    Func<bool>? gameFocused = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly object sync = new();
    private readonly HashSet<int> keys = [];
    private readonly HashSet<int> buttons = [];
    private long lastKeyboard = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long lastMouse = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long lastGameKeyboard = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long lastGameMouse = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long? lastChat;
    private bool available;
    private long injectedKeyboardEvents, injectedMouseEvents;

    public void setAvailable(bool value)
    {
        lock (sync)
        {
            available = value;
            journal?.observe("input_monitor", value ? "available" : "unavailable");
            if (!value) { keys.Clear(); buttons.Clear(); }
        }
    }

    public void key(int code, bool down, bool injected, int scanCode = 0)
    {
        lock (sync)
        {
            if (injected) { injectedKeyboardEvents++; return; }
            if (code is < 1 or > 254) return;
            var changed = down ? keys.Add(code) : keys.Remove(code);
            if (changed) journal?.record("physical_key", $"{code} {(down ? "down" : "up")}");
            lastKeyboard = clock.GetTimestamp();
            if (gameFocused?.Invoke() ?? true)
            {
                lastGameKeyboard = lastKeyboard;
                if (down && (code is 0x59 or 0x55 or 0x0D || scanCode == 0x1C)) lastChat = lastKeyboard;
            }
        }
    }

    public void mouse(int button, bool down, bool injected)
    {
        lock (sync)
        {
            if (injected) { injectedMouseEvents++; return; }
            var changed = down ? buttons.Add(button) : buttons.Remove(button);
            if (changed) journal?.record("physical_button", $"{button} {(down ? "down" : "up")}");
            lastMouse = clock.GetTimestamp();
            if (gameFocused?.Invoke() ?? true) lastGameMouse = lastMouse;
        }
    }

    public void physicalKey(int code, int scanCode, bool down, bool injected, bool extended)
    {
        key(code, down, injected, scanCode);
        shortcuts?.key(scanCode, down, injected, extended);
    }

    public void seedHeldKey(int code)
    {
        key(code, true, false);
        shortcuts?.seedHeldKey(code);
    }

    public InputDiagnostics diagnostics()
    {
        lock (sync) return new(keys.Order().ToArray(), buttons.Order().ToArray(), injectedKeyboardEvents, injectedMouseEvents);
    }

    public InputSnapshot snapshot(int gateMs, int chatCooldownMs = 25000) => readSnapshot(gateMs, chatCooldownMs, false);
    public InputSnapshot gameSnapshot(int gateMs, int chatCooldownMs = 25000) => readSnapshot(gateMs, chatCooldownMs, true);

    private InputSnapshot readSnapshot(int gateMs, int chatCooldownMs, bool gameOnly)
    {
        lock (sync)
        {
            var focused = gameFocused?.Invoke() ?? true;
            if (gameOnly && (!focused || !available)) return new(false, false, false, 0, false, null, 0);
            var keyboardIdle = (long)clock.GetElapsedTime(gameOnly ? lastGameKeyboard : lastKeyboard).TotalMilliseconds;
            var mouseIdle = (long)clock.GetElapsedTime(gameOnly ? lastGameMouse : lastMouse).TotalMilliseconds;
            long? chatIdle = lastChat is { } timestamp ? (long)clock.GetElapsedTime(timestamp).TotalMilliseconds : null;
            var chatRemaining = focused && chatIdle is { } idle ? Math.Max(0, chatCooldownMs - idle) : 0;
            return new(available, keys.Count > 0 || keyboardIdle < gateMs, buttons.Count > 0 || mouseIdle < gateMs,
                Math.Min(keyboardIdle, mouseIdle), chatRemaining > 0, chatIdle, chatRemaining);
        }
    }
}

public sealed record InputSnapshot(bool Available, bool KeyboardActive, bool MouseActive, long IdleMs,
    bool IsChatting, long? TimeSinceChattingMs, long ChatCooldownRemainingMs);
public sealed record InputDiagnostics(IReadOnlyList<int> HeldKeys, IReadOnlyList<int> HeldButtons,
    long InjectedKeyboardEvents, long InjectedMouseEvents);
