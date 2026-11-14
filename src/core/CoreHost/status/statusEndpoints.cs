using CoreHost.Commands;
using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Window;
using Microsoft.Extensions.Options;

namespace CoreHost.Status;

public static class StatusEndpoints
{
    public static void mapStatusEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/v3/runtime/game", (RuntimeGameState state, InputActivityTracker input) =>
        {
            input.setMainMenu(state.IsMainMenu);
            return ApiResult.Success(null, null, state);
        });
        endpoints.MapGet("/v3/status", (CoreStatus status) => ApiResult.Success(null, null, status.snapshot()));
        endpoints.MapGet("/v3/commands", (HttpRequest request, ConsoleCommandActivity activity, GameWindows windows) =>
        {
            var cursor = request.Query["after"];
            var after = 0L;
            if (cursor.Count > 1 || cursor.Count == 1 && (!long.TryParse(cursor, out after) || after < 0))
                return ApiResult.Failure("INVALID_COMMAND_CURSOR", "The command cursor must be a non-negative integer.");
            var history = activity.readCommands(after);
            var game = windows.gameProcess;
            return ApiResult.Success(null, null, new {
                history.StreamId, history.Sequence, history.OldestSequence, history.EventsLost, history.Commands,
                game = game is null ? null : new { processId = game.Id, windowHandle = game.MainWindowHandle }
            });
        });
        endpoints.MapGet("/v2/meta/get", (CoreStatus status) => ApiResult.Success(null, null, status.legacyMeta()));
        endpoints.MapGet("/v2/runtime/ready", (IOptionsMonitor<CoreHostOptions> options) => ApiResult.Success(null, null, CoreRuntimeIdentity.Create(options.CurrentValue)));
        endpoints.MapGet("/v2/health", (GameWindows windows, ForegroundWindowService foreground, ConsoleCommandRunner console, IOptionsMonitor<CoreHostOptions> options) =>
        {
            var process = windows.gameProcess;
            var config = options.CurrentValue;
            return ApiResult.Success(null, null, new
            {
                core = new { version = ProductVersion.Value, transport = "foreground-console-automation", apiHost = config.Core.Host, apiPort = config.Core.Port, running = true },
                focus = new { gameIsFocused = windows.isFocused("game"), foregroundWindowHandle = handle(foreground.GetForegroundWindow()),
                    gameWindowHandle = process is null ? null : handle(process.WindowHandle) },
                gameRunning = windows.isRunning("game"), process, binary = process?.Binary,
                lastListPlayers = console.lastListPlayers
            });
        });
    }

    private static string handle(IntPtr value) => $"0x{value.ToInt64():X16}";
}

public sealed record RuntimeGameState(bool IsMainMenu);
