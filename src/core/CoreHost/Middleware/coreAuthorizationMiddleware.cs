using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;

namespace CoreHost.Middleware;

public sealed class CoreAuthorizationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, IOptionsMonitor<CoreHostOptions> options)
    {
        var path = context.Request.Path;
        var protectedPath = path.StartsWithSegments("/v3") || path == "/v2/runtime/ready" ||
            HttpMethods.IsPost(context.Request.Method) && (path.StartsWithSegments("/v2/console") || path.StartsWithSegments("/v2/native"));
        if (protectedPath && !CoreRequestAuthorization.IsAuthorized(context.Request.Headers["X-Chiv-Admin-Token"].ToString(), options.CurrentValue.Core.AuthToken))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(ApiResult.FailureEnvelope("UNAUTHORIZED", "Missing or invalid X-Chiv-Admin-Token header."));
            return;
        }
        await next(context);
    }
}
