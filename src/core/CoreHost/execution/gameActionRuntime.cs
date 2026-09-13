using CoreHost.Actions;
using CoreHost.Commands;
using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Window;
using Microsoft.Extensions.Options;
using CoreHost.Debug;

namespace CoreHost.Execution;

public sealed class GameActionRuntime(GameWindows windows, InputActivityTracker input, KeyboardInput keyboard,
    ConsoleCommandRunner console, KeyCommandRunner keys, IOptionsMonitor<CoreHostOptions> options, DebugJournal? journal = null) : IActionRuntime
{
    private bool restoreApp;
    private AppTarget? activeApp;
    private GameProcessInfo? activeGame, cleanupGame;
    public void refresh() => windows.refresh();

    public ExecutionEligibility canExecuteCommand(string priority = "normal")
    {
        if (!windows.isRunning("app") || !windows.isRunning("game")) return new(false, "PROCESS_NOT_RUNNING", true);
        if (!windows.isFocused("app") && !windows.isFocused("game")) return new(false, "WINDOW_NOT_FOREGROUND");
        if (!windows.isReady(windows.isFocused("game") ? "game" : "app")) return new(false, "WINDOW_NOT_READY");
        var gateMs = options.CurrentValue.gateMs(priority);
        var bypass = priority == "high" && gateMs == 0;
        var physical = input.snapshot(gateMs, options.CurrentValue.Input.ChatCooldownMs);
        if (!bypass && !physical.Available) return new(false, "INPUT_MONITOR_UNAVAILABLE");
        if (!bypass && physical.KeyboardActive) return new(false, "KEYBOARD_ACTIVE");
        if (!bypass && physical.MouseActive) return new(false, "MOUSE_ACTIVE");
        if (!bypass && physical.IsChatting) return new(false, "CHAT_ACTIVE");
        return new(true);
    }

    public ExecutionEligibility eligibility(CoreActionRequest action)
    {
        if (!windows.matches(action.App)) return new(false, "APP_SESSION_CHANGED", true);
        var decision = canExecuteCommand(action.Priority);
        var minimumIdle = action.Commands.Max(command => command.MinimumIdleMs ?? 0);
        if (decision.Allowed && action.Priority != "high" && minimumIdle > input.snapshot(0).IdleMs)
            return new(false, "MINIMUM_IDLE_NOT_REACHED");
        return decision;
    }

    public async Task<OperationResult> prepare(QueuedAction action, CancellationToken token)
    {
        discardChangedConsole();
        action.Game ??= windows.gameProcess;
        if (action.Game is null) return OperationResult.Failure("WINDOW_NOT_FOUND", "The game window is not available.");
        if (!windows.matchesGame(action.Game)) return OperationResult.Failure("GAME_SESSION_CHANGED", "The Action's game process or window changed.");
        activeApp = action.Request.App;
        activeGame = action.Game;
        restoreApp = windows.isFocused("app");
        var released = keyboard.releaseAll();
        if (!released.Ok) return released;
        journal?.phase("focus_game");
        var result = await windows.focus("game", token);
        if (result.Ok && console.needsCleanup)
        {
            console.consoleDiscard();
            cleanupGame = null;
        }
        return result;
    }

    public async Task<CommandOutcome> execute(QueuedAction action, CoreCommand command, Action submitted, CancellationToken token)
    {
        var sent = false;
        string? interrupt = null;
        using var watchStop = new CancellationTokenSource();
        using var execution = CancellationTokenSource.CreateLinkedTokenSource(token);
        void check()
        {
            execution.Token.ThrowIfCancellationRequested();
            if (!windows.matchesGame(action.Game)) throw new InputInterruptedException("GAME_SESSION_CHANGED");
            var state = eligibility(action.Request);
            if (!state.Allowed) throw new InputInterruptedException(state.Reason!);
            if (!windows.isReady("game")) throw new InputInterruptedException("WINDOW_NOT_READY");
        }
        async Task watch()
        {
            try
            {
                while (true)
                {
                    await Task.Delay(options.CurrentValue.Queue.RecheckMs, watchStop.Token);
                    try { check(); }
                    catch (InputInterruptedException exception) { interrupt = exception.Message; execution.Cancel(); return; }
                }
            }
            catch (OperationCanceledException) { }
        }
        var monitor = watch();
        try
        {
            check();
            if (!action.DelayComplete)
            {
                if (action.DelayRemainingMs < 0) action.DelayRemainingMs = command.DelayMs;
                if (action.DelayRemainingMs > 0) journal?.phase("delay");
                var started = Environment.TickCount64;
                try { await Task.Delay(TimeSpan.FromMilliseconds(action.DelayRemainingMs), execution.Token); action.DelayComplete = true; }
                finally { action.DelayRemainingMs = Math.Max(0, action.DelayRemainingMs - (Environment.TickCount64 - started)); }
            }
            void mark() { sent = true; submitted(); }
            if (command.Type == "console") cleanupGame = action.Game;
            return command.Type == "console"
                ? await console.run(command, check, mark, execution.Token, action.Warnings.Add)
                : await keys.run(action, command, check, mark, execution.Token);
        }
        catch (InputInterruptedException exception) { return new(sent, ErrorCode: exception.Message, Paused: exception.Message != "GAME_SESSION_CHANGED"); }
        catch (OperationCanceledException) when (interrupt is not null) { return new(sent, ErrorCode: interrupt, Paused: interrupt != "GAME_SESSION_CHANGED"); }
        catch (OperationCanceledException) when (!action.Cancelled && Environment.TickCount64 < action.Deadline)
        { return new(sent, ErrorCode: "COMMAND_TIMEOUT", ErrorMessage: "Command execution timed out."); }
        finally { watchStop.Cancel(); await monitor; }
    }

    public async Task<IReadOnlyList<string>> cleanup(CancellationToken token)
    {
        var warnings = new List<string>();
        var released = keyboard.releaseAll();
        if (!released.Ok) warnings.Add(released.ErrorMessage!);
        discardChangedConsole();
        if (console.needsCleanup)
        {
            if (windows.isReady("game"))
            {
                try { console.consoleDiscard(); cleanupGame = null; }
                catch (Exception exception) { warnings.Add($"CONSOLE_CLEANUP_FAILED: {exception.Message}"); }
            }
            else warnings.Add("CONSOLE_CLEANUP_DEFERRED");
        }
        if (restoreApp && activeApp is not null && windows.matches(activeApp) && windows.matchesGame(activeGame) && windows.isFocused("game"))
        {
            try
            {
                journal?.phase("restore_app");
                var restored = await windows.focus("app", token);
                if (!restored.Ok) warnings.Add(restored.ErrorCode!);
            }
            catch (Exception exception) { warnings.Add($"FOREGROUND_RESTORE_FAILED: {exception.Message}"); }
        }
        restoreApp = false;
        activeApp = null;
        activeGame = null;
        return warnings;
    }

    private void discardChangedConsole()
    {
        if (!console.needsCleanup || !windows.matchesGame(cleanupGame))
        {
            console.closed();
            cleanupGame = null;
        }
    }
}
