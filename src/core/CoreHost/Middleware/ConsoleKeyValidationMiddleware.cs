using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Middleware;

public sealed class ConsoleKeyValidationMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context)
    {
        if (HttpMethods.IsPost(context.Request.Method) &&
            context.Request.Path.StartsWithSegments("/v2/console") &&
            context.Request.Headers.TryGetValue(ConsoleKeySelection.HeaderName, out var values) &&
            (values.Count != 1 || !ConsoleKeySelection.TryGetKey(values[0] ?? string.Empty, out _)))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response.WriteAsJsonAsync(ApiResult.FailureEnvelope("INVALID_REQUEST", "Console key must be a supported physical key code."));
            return;
        }

        await next(context);
    }
}
