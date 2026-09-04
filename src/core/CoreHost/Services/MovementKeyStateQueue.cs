using System.Threading.Channels;

namespace CoreHost.Services;

internal sealed class MovementKeyStateQueue
{
    private readonly Channel<MovementKeyStateChange> _changes =
        Channel.CreateUnbounded<MovementKeyStateChange>(
        new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = true
        });
    private readonly Dictionary<int, IntPtr> _pressedForegroundWindows = [];
    private readonly object _sync = new();
    private bool _completed;

    public bool TryWrite(MovementKeyStateChange change)
    {
        lock (_sync)
        {
            if (_completed) return false;

            if (change.IsKeyDown)
            {
                if (_pressedForegroundWindows.TryGetValue(
                        change.VirtualKey,
                        out var foregroundWindow) &&
                    foregroundWindow == change.ForegroundWindow)
                {
                    return true;
                }

                _pressedForegroundWindows[change.VirtualKey] = change.ForegroundWindow;
            }
            else
            {
                _pressedForegroundWindows.Remove(change.VirtualKey);
            }

            return _changes.Writer.TryWrite(change);
        }
    }

    public IAsyncEnumerable<MovementKeyStateChange> ReadAllAsync()
        => _changes.Reader.ReadAllAsync();

    public void Complete()
    {
        lock (_sync)
        {
            if (_completed) return;

            _completed = true;
            _changes.Writer.TryComplete();
        }
    }
}

internal readonly record struct MovementKeyStateChange(
    int VirtualKey,
    bool IsKeyDown,
    IntPtr ForegroundWindow);
