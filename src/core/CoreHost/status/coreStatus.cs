using CoreHost.Actions;
using CoreHost.Execution;
using CoreHost.Input;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Window;
using Microsoft.Extensions.Options;

namespace CoreHost.Status;

public sealed class CoreStatus(GameWindows windows, InputActivityTracker input, GameActionRuntime runtime,
    ActionQueue queue, ConsoleCommandActivity activity, IOptionsMonitor<CoreHostOptions> options)
{
    public object snapshot()
    {
        var physical = input.gameSnapshot(options.CurrentValue.QueueGateNormal, options.CurrentValue.Input.ChatCooldownMs);
        var gameRunning = windows.isRunning("game");
        var appRunning = windows.isRunning("app");
        var gameReady = windows.isReady("game");
        var action = queue.currentAction;
        var decision = action is null ? runtime.canExecuteCommand() : runtime.eligibility(action);
        var recentCommands = activity.GetRecentSnapshots();
        return new
        {
            mouseShowing = physical.MouseShowing,
            runtime = new { enabled = gameRunning && appRunning, gameRunning, appRunning },
            focus = new { gameFocused = windows.isFocused("game"), appFocused = windows.isFocused("app"), gameReady,
                reason = gameReady ? null : "WINDOW_NOT_READY", overlayState = "unknown",
                limitation = "Steam overlay visibility is not available through Windows focus checks." },
            input = physical,
            execution = new { canExecuteCommand = decision.Allowed, reason = decision.Reason },
            queue = queue.snapshot(Environment.TickCount64),
            lastCommand = recentCommands.FirstOrDefault(),
            recentCommands
        };
    }

    public object legacyMeta()
    {
        var physical = input.gameSnapshot(options.CurrentValue.QueueGateNormal, options.CurrentValue.Input.ChatCooldownMs);
        return new
        {
            mouseShowing = physical.MouseShowing,
            gameRunning = windows.isRunning("game"), focus = new { gameIsFocused = windows.isFocused("game") },
            movement = new { physical.Available, isMoving = physical.KeyboardActive || physical.MouseActive,
                timeSinceMovementMs = physical.IdleMs, physical.IsChatting, physical.TimeSinceChattingMs, physical.ChatCooldownRemainingMs,
                physical.CheckLockActive },
            lastCommand = activity.GetSnapshot()
        };
    }

}
