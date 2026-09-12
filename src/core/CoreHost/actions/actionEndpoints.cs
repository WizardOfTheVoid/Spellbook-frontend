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
        endpoints.MapPost("/v3/actions", async (CoreActionRequest request, ActionQueue queue, GameWindows windows,
            IOptionsMonitor<CoreHostOptions> options, CancellationToken cancellationToken) =>
        {
            var error = ActionValidation.error(request);
            if (error is not null) return ApiResult.Failure("INVALID_ACTION", error, request?.Id);
            if (!windows.register(request!.App)) return ApiResult.Failure("INVALID_APP_TARGET", "The app window must belong to the supplied running process.", request.Id);
            var config = options.CurrentValue.Queue;
            return ApiResult.FromExecution(await queue.enqueue(request, Environment.TickCount64,
                config.ActionTtlMs, config.MaxPendingActions, cancellationToken));
        });
    }
}
