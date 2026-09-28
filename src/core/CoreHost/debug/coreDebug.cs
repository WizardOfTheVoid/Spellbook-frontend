using System.Text.Json;
using CoreHost.Actions;
using CoreHost.Execution;
using CoreHost.Input;
using CoreHost.Status;
using CoreHost.Window;

namespace CoreHost.Debug;

public sealed class CoreDebug(CoreStatus status, ActionQueue queue, GameActionRuntime runtime,
    InputActivityTracker input, GameWindows windows, DebugJournal journal, DebugShortcuts shortcuts, DebugTimingSettings settings)
{
    private readonly CpuUsage cpuUsage = new();

    public object snapshot(long after)
    {
        var armed = shortcuts.heartbeat();
        windows.refresh();
        var game = windows.inspect("game");
        var app = windows.inspect("app");
        var ordinary = runtime.canExecuteCommand();
        journal.observe("game_window", JsonSerializer.Serialize(game));
        journal.observe("app_window", JsonSerializer.Serialize(app));
        journal.observe("ordinary_gate", ordinary.Reason ?? "ready");
        var events = shortcuts.events(after);
        return new
        {
            status = status.snapshot(), cpuPercent = cpuUsage.read(), events.Sequence, events.Events, events.EventsLost, armed,
            queue = queue.debugSnapshot(Environment.TickCount64), execution = journal.execution, input = input.diagnostics(),
            windows = new { game, app }, settings = settings.snapshot(),
            ordinaryGate = new { canExecuteCommand = ordinary.Allowed, reason = ordinary.Reason }
        };
    }
}
