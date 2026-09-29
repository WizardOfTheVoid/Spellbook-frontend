using CoreHost.Models;
using CoreHost.Win32;

namespace CoreHost.Input;

public sealed class KeyboardInput(IKeyboardInputApi native)
{
    private readonly object sync = new();
    private readonly List<KeyboardInputEvent> held = [];

    public OperationResult releaseAll()
    {
        lock (sync)
        {
            var error = "";
            for (var attempt = 0; attempt < 2 && held.Count > 0; attempt++)
            {
                var releases = held.AsEnumerable().Reverse().Select(key => key with { Flags = key.Flags | NativeMethods.KEYEVENTF_KEYUP }).ToArray();
                try
                {
                    var result = submit(releases);
                    error = $"Key release sent {result.Sent}/{releases.Length} events (error {result.Error}).";
                }
                catch (Exception failure) { error = $"Key release failed: {failure.Message}"; }
            }
            return held.Count == 0 ? OperationResult.Success()
                : OperationResult.Failure("INPUT_RELEASE_FAILED", $"{error} {held.Count} generated key(s) remain held.");
        }
    }

    public void open(string code)
    {
        var key = ConsoleKeys.get(code);
        var flags = NativeMethods.KEYEVENTF_SCANCODE | (key.Extended ? 1u : 0);
        send([new(0, key.ScanCode, flags), new(0, key.ScanCode, flags | NativeMethods.KEYEVENTF_KEYUP)]);
    }

    public void enter(Action submitted) => send(pair(13), submitted);
    public void paste() => send([new(17, 0, 0), new(86, 0, 0), new(86, 0, 2), new(17, 0, 2)]);

    public async Task hold(ushort code, int durationMs, Action submitted, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        Exception? failure = null;
        try
        {
            send([new(code, 0, 0)], submitted);
            if (durationMs > 0) await Task.Delay(durationMs, cancellationToken);
        }
        catch (Exception error) { failure = error; throw; }
        finally
        {
            var cleanup = releaseAll();
            if (!cleanup.Ok)
            {
                var message = $"{failure?.Message} {cleanup.ErrorMessage}".Trim();
                if (failure is OperationCanceledException) throw new OperationCanceledException(message, failure, cancellationToken);
                throw new InputException(message, failure);
            }
        }
    }

    private void send(KeyboardInputEvent[] events, Action? submitted = null)
    {
        try
        {
            var result = submit(events);
            if (result.Sent > 0) submitted?.Invoke();
            if (result.Sent != events.Length) throw new InputException($"SendInput sent {result.Sent}/{events.Length} events (error {result.Error}).");
        }
        catch (Exception failure)
        {
            var cleanup = releaseAll();
            if (cleanup.Ok) throw;
            throw new InputException($"{failure.Message} {cleanup.ErrorMessage}", failure);
        }
    }

    private KeyboardInputSendResult submit(KeyboardInputEvent[] events)
    {
        lock (sync)
        {
            var result = native.Send(events);
            foreach (var item in events.Take((int)result.Sent))
            {
                var key = item with { Flags = item.Flags & ~NativeMethods.KEYEVENTF_KEYUP };
                if ((item.Flags & NativeMethods.KEYEVENTF_KEYUP) != 0) held.Remove(key);
                else if (!held.Contains(key)) held.Add(key);
            }
            return result;
        }
    }

    private static KeyboardInputEvent[] pair(ushort key) => [new(key, 0, 0), new(key, 0, NativeMethods.KEYEVENTF_KEYUP)];
}

public sealed class InputException(string message, Exception? inner = null) : Exception(message, inner);
