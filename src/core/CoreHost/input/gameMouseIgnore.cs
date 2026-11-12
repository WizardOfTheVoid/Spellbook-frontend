namespace CoreHost.Input;

public sealed partial class InputActivityTracker
{
    private readonly HashSet<int> suppressedButtons = [];
    private long? mouseIgnoreStarted;
    private bool ignoredMouseMovement, ignoredMouseClicks;
    private int ignoredMoves, ignoredClicks;

    public bool mouseIgnoredInGame
    {
        get { lock (sync) return isIgnoringMouseInGame(); }
    }

    public void ignoreMouseInGame(bool movement = false, bool clicks = false)
    {
        lock (sync)
        {
            if (!movement && !clicks)
            {
                if (mouseIgnoreStarted is { } started)
                    journal?.record("mouse_ignore", $"released after {clock.GetElapsedTime(started).TotalMilliseconds:F0} ms; moves={ignoredMoves}, clicks={ignoredClicks}");
                mouseIgnoreStarted = null;
                ignoredMouseMovement = ignoredMouseClicks = false;
                return;
            }
            if (!available || gameFocused?.Invoke() != true)
                throw new InputException("Mouse ignoring requires the input monitor and focused game.");
            if (mouseIgnoreStarted is null)
            {
                mouseIgnoreStarted = clock.GetTimestamp();
                ignoredMoves = ignoredClicks = 0;
                journal?.record("mouse_ignore", $"enabled; movement={movement}, clicks={clicks}");
            }
            ignoredMouseMovement = movement;
            ignoredMouseClicks = clicks;
        }
    }

    public bool physicalMouse(int button, bool down, bool injected, int x = 0, int y = 0, bool movement = false, bool wheel = false)
    {
        lock (sync)
        {
            var ignored = suppressMouse(button, down, injected, x, y, movement, wheel);
            if (button != 0 || injected) mouse(button, down, injected, ignored);
            return ignored;
        }
    }

    private bool suppressMouse(int button, bool down, bool injected, int x, int y, bool movement, bool wheel)
    {
        if (injected) return false;
        if (button != 0)
        {
            if (!down) return suppressedButtons.Remove(button);
            if (suppressedButtons.Contains(button)) return true;
        }
        if (!isIgnoringMouseInGame() || gameMouseTarget?.Invoke(x, y) != true) return false;
        if (movement && ignoredMouseMovement) { ignoredMoves++; return true; }
        if (!ignoredMouseClicks || button == 0 && !wheel) return false;
        if (button != 0) suppressedButtons.Add(button);
        ignoredClicks++;
        return true;
    }

    private bool isIgnoringMouseInGame()
    {
        if (mouseIgnoreStarted is { } started && (!available || gameFocused?.Invoke() != true ||
            clock.GetElapsedTime(started).TotalMilliseconds >= 2000)) ignoreMouseInGame();
        return mouseIgnoreStarted is not null;
    }
}
