using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Window;
using Microsoft.Extensions.Options;

namespace CoreHost.Actions;

public static class ActionEndpoints
{
    public static void mapActionEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/v3/runtime/app", (AppTarget app, GameWindows windows) =>
            windows.register(app) ? ApiResult.Success(null, null, new { registered = true })
                : ApiResult.Failure("INVALID_APP_TARGET", "The app window must belong to the supplied running process."));
        endpoints.MapPost("/v3/runtime/app/input-focus", (InputFocusUpdate request, GameWindows windows) =>
        {
            if (request.App is null || request.InputFocused is not { } focused || request.Sequence is < 1 or > 9007199254740991)
                return ApiResult.Failure("INVALID_INPUT_FOCUS", "A registered app, positive safe sequence and inputFocused boolean are required.");
            return windows.setInputFocus(request.App, request.Sequence, focused)
                ? ApiResult.Success(null, null, new { updated = true })
                : ApiResult.Failure("INVALID_APP_TARGET", "Input focus must come from the currently registered app window.");
        });
        endpoints.MapPost("/v3/actions/{id}/cancel", (string id, ActionQueue queue) =>
            queue.control("cancel", id, out var found)
                ? ApiResult.Success(id, null, new { found })
                : ApiResult.Failure("INVALID_ACTION", "A valid action id is required.", id));
        endpoints.MapPost("/v3/actions", async (CoreActionRequest request, ActionQueue queue, GameWindows windows,
            IOptionsMonitor<CoreHostOptions> options, CancellationToken cancellationToken) =>
        {
            var error = ActionValidation.error(request);
            if (error is not null) return ApiResult.Failure(error == "KEYBOARD_LAYOUT_REQUIRED" ? error : "INVALID_ACTION", error, request?.Id);
            if (!windows.register(request!.App)) return ApiResult.Failure("INVALID_APP_TARGET", "The app window must belong to the supplied running process.", request.Id);
            var config = options.CurrentValue.Queue;
            return ApiResult.FromExecution(await queue.enqueue(request, Environment.TickCount64,
                request.Author == "user" ? config.UserActionTtlMs : config.SystemActionTtlMs,
                config.MaxPendingActions, cancellationToken));
        });
    }

    private sealed record InputFocusUpdate(AppTarget? App, long Sequence, bool? InputFocused);
}
