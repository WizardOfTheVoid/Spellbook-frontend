using System.Diagnostics;
using System.Globalization;

namespace CoreHost.Middleware;

public sealed class CompactRequestLoggingMiddleware
{
    private readonly RequestDelegate next;

    public CompactRequestLoggingMiddleware(RequestDelegate next)
    {
        this.next = next;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var stopwatch = Stopwatch.StartNew();

        try
        {
            await next(context).ConfigureAwait(false);
        }
        finally
        {
            stopwatch.Stop();
            var path = context.Request.Path.HasValue ? context.Request.Path.Value : "/";
            var elapsedMs = stopwatch.Elapsed.TotalMilliseconds.ToString("0.###", CultureInfo.InvariantCulture);
            Console.WriteLine($"HTTP {context.Request.Method} {path} -> {context.Response.StatusCode} {elapsedMs}ms");
        }
    }
}