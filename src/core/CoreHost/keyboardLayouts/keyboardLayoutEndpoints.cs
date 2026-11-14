using CoreHost.Models;
using CoreHost.Window;
using CoreHost.Input;

namespace CoreHost.KeyboardLayouts;

public static class KeyboardLayoutEndpoints
{
    public static void mapKeyboardLayoutEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/v3/keyboard-layouts", (IKeyboardLayoutApi api, KeyboardLayoutService layouts, GameWindows windows) =>
        {
            try
            {
                windows.refresh();
                var installed = api.getInstalled();
                string? gameLayoutId = null;
                if (windows.gameProcess is { } game)
                    try { gameLayoutId = api.read(game).LayoutId; } catch (KeyboardLayoutException) { }
                return ApiResult.Success(null, null, new { capabilityVersion = 1, installed, gameLayoutId, restorationFault = layouts.pendingRestoration });
            }
            catch (Exception exception) { return ApiResult.Failure("KEYBOARD_LAYOUT_UNAVAILABLE", exception.Message); }
        });
        endpoints.MapPost("/v3/keyboard-layouts/restore", async (KeyboardLayoutService layouts, GameWindows windows, CancellationToken token) =>
        {
            try
            {
                var result = await layouts.retryRestore(() => {
                    windows.refresh();
                    if (!windows.isFocused("game") && !windows.isFocused("app")) throw new InvalidOperationException("Focus Chivalry or SpellBook before retrying restoration.");
                }, token);
                return result.Ok ? ApiResult.Success(null, null, new { restored = true }) : ApiResult.Failure(result.ErrorCode!, result.ErrorMessage!);
            }
            catch (Exception exception) { return ApiResult.Failure("KEYBOARD_LAYOUT_RESTORE_FAILED", exception.Message); }
        });
    }
}
