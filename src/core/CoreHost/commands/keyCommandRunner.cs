using CoreHost.Actions;
using CoreHost.Input;
using CoreHost.Services;
using CoreHost.Debug;

namespace CoreHost.Commands;

public sealed class KeyCommandRunner(KeyboardInput keyboard, ConsoleCommandActivity activity, DebugJournal? journal = null)
{
    public async Task<CommandOutcome> run(QueuedAction action, CoreCommand command, Action check,
        Action submitted, CancellationToken token)
    {
        for (var index = action.KeyCursor; index < command.Presses!.Count; index++)
        {
            check();
            journal?.phase("key_hold");
            var press = command.Presses[index];
            var commandIndex = action.Cursor;
            await keyboard.hold((ushort)press.VirtualKey!.Value, press.DurationMs!.Value, () =>
            {
                action.KeyCursor = index + 1;
                journal?.record("key_submitted", $"Key {press.VirtualKey} ({index + 1}/{command.Presses.Count})", action.Request.Id, commandIndex);
                if (index == command.Presses.Count - 1) submitted();
                activity.Record($"Key {press.VirtualKey}");
            }, token);
        }
        return new(true);
    }
}
