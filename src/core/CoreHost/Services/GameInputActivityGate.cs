using CoreHost.Models;
using CoreHost.Win32;

namespace CoreHost.Services;

public interface IGameInputActivityGate
{
    ConsoleExecutionResult? Check(string requestId, bool requireIdle);
}

public sealed class GameInputActivityGate(
    IGameProcessTargetLocator gameProcess,
    IWindowApi windows,
    MovementActivityTracker movementActivity) : IGameInputActivityGate
{
    public ConsoleExecutionResult? Check(string requestId, bool requireIdle)
    {
        if (!requireIdle) return null;

        var movement = movementActivity.GetSnapshot();
        if (!movement.Available)
        {
            return Skipped(requestId, "MOVEMENT_MONITOR_UNAVAILABLE", movement.TimeSinceMovementMs);
        }

        var game = gameProcess.GetTargetProcess();
        if (!game.Success || game.Process is null ||
            windows.GetForegroundWindow() != game.Process.WindowHandle)
        {
            return Skipped(requestId, "GAME_NOT_FOREGROUND", movement.TimeSinceMovementMs);
        }

        return movement.IsMoving
            ? Skipped(requestId, "RECENT_MOVEMENT", movement.TimeSinceMovementMs)
            : null;
    }

    private static ConsoleExecutionResult Skipped(
        string requestId,
        string reason,
        long movementIdleMs)
    {
        return ConsoleExecutionResult.Success(
            requestId,
            "game-input",
            new { executed = false, reason, movementIdleMs });
    }
}
