using CoreHost.Debug;
using CoreHost.Win32;

namespace CoreHost.Input;

public sealed class InputActivityTracker(TimeProvider? timeProvider = null, DebugJournal? journal = null, DebugShortcuts? shortcuts = null,
    Func<bool>? gameFocused = null, Func<bool>? appFocused = null, ICursorApi? cursor = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly object sync = new();
    private readonly HashSet<int> keys = [];
    private readonly HashSet<int> buttons = [];
    private readonly HashSet<int> suppressedButtons = [];
    private volatile bool suppressMouseClicks;
    private long lastKeyboard = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long lastMouse = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long lastGameKeyboard = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long lastGameMouse = (timeProvider ?? TimeProvider.System).GetTimestamp();
    private long? lastChat;
    private long? lastKeyboardUsedMouseVisible;
    private long? appRoundTripStarted;
    private bool available;
    private bool mainMenu;
    private long injectedKeyboardEvents, injectedMouseEvents;

    public bool SuppressMouseClicks { get => suppressMouseClicks; set => suppressMouseClicks = value; }

    public void setMainMenu(bool value)
    {
        lock (sync) mainMenu = value;
    }

    public bool suppressMouseClick(int button, bool down, bool injected)
    {
        if (button == 0 || injected) return false;
        lock (sync)
        {
            if (!down) return suppressedButtons.Remove(button);
            if (suppressedButtons.Contains(button)) return true;
            if (!suppressMouseClicks || gameFocused?.Invoke() != true) return false;
            suppressedButtons.Add(button);
            return true;
        }
    }

    public bool WillPerformAppRoundTrip
    {
        get { lock (sync) return appRoundTripStarted is not null; }
        set { lock (sync) appRoundTripStarted = value ? clock.GetTimestamp() : null; }
    }

    public bool isCheckLockActive()
    {
        lock (sync)
        {
            if (appFocused?.Invoke() == true)
            {
                lastChat = null;
                lastKeyboardUsedMouseVisible = null;
                return true;
            }
            return appRoundTripStarted is { } started && clock.GetElapsedTime(started).TotalMilliseconds < 2000;
        }
    }

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
            if (isCheckLockActive()) return;
            lastKeyboard = clock.GetTimestamp();
            if (gameFocused?.Invoke() ?? true)
            {
                lastGameKeyboard = lastKeyboard;
                if (down && isMouseShowing()) lastKeyboardUsedMouseVisible = lastKeyboard;
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
            if (isCheckLockActive()) return;
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

    private bool isMouseShowing() => (gameFocused?.Invoke() ?? false) &&
        cursor?.getFlags() is uint flags && (flags & NativeMethods.CURSOR_SHOWING) != 0 &&
        (gameFocused?.Invoke() ?? false);

    private InputSnapshot readSnapshot(int gateMs, int chatCooldownMs, bool gameOnly)
    {
        lock (sync)
        {
            var mouseShowing = isMouseShowing();
            var checkLockActive = isCheckLockActive();
            var focused = gameFocused?.Invoke() ?? true;
            if (gameOnly && (!focused || !available)) return new(false, false, false, 0, false, null, 0, checkLockActive, mouseShowing);
            var keyboardIdle = (long)clock.GetElapsedTime(gameOnly ? lastGameKeyboard : lastKeyboard).TotalMilliseconds;
            var mouseIdle = (long)clock.GetElapsedTime(gameOnly ? lastGameMouse : lastMouse).TotalMilliseconds;
            long? chatIdle = lastChat is { } timestamp ? (long)clock.GetElapsedTime(timestamp).TotalMilliseconds : null;
            var chatRemaining = !checkLockActive && focused && chatIdle is { } idle ? Math.Max(0, chatCooldownMs - idle) : 0;
            var keyboardUsedMouseVisibleRemaining = !checkLockActive && focused && lastKeyboardUsedMouseVisible is { } used
                ? Math.Max(0, (mainMenu ? 40000 : 10000) - (long)clock.GetElapsedTime(used).TotalMilliseconds) : 0;
            return new(available, !checkLockActive && (keys.Count > 0 || keyboardIdle < gateMs),
                !checkLockActive && (buttons.Count > 0 || mouseIdle < gateMs),
                Math.Min(keyboardIdle, mouseIdle), chatRemaining > 0, chatIdle, chatRemaining, checkLockActive,
                mouseShowing, keyboardUsedMouseVisibleRemaining);
        }
    }
}

public sealed record InputSnapshot(bool Available, bool KeyboardActive, bool MouseActive, long IdleMs,
    bool IsChatting, long? TimeSinceChattingMs, long ChatCooldownRemainingMs, bool CheckLockActive = false,
    bool MouseShowing = false, long KeyboardUsedMouseVisibleCooldownRemainingMs = 0);
public sealed record InputDiagnostics(IReadOnlyList<int> HeldKeys, IReadOnlyList<int> HeldButtons,
    long InjectedKeyboardEvents, long InjectedMouseEvents);
