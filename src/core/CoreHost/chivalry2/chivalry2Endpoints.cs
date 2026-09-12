using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;

namespace CoreHost.Chivalry2;

public static class Chivalry2Endpoints
{
    public static void mapChivalry2Endpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/chivalry2");
        group.AddEndpointFilter(async (context, next) =>
        {
            var options = context.HttpContext.RequestServices.GetRequiredService<IOptions<CoreHostOptions>>().Value;
            var token = context.HttpContext.Request.Headers["X-Chiv-Admin-Token"].ToString();
            if (!CoreRequestAuthorization.IsAuthorized(token, options.Core.AuthToken))
            {
                return ApiResult.Failure("UNAUTHORIZED", "Missing or invalid X-Chiv-Admin-Token header.", statusCode: StatusCodes.Status401Unauthorized);
            }
            try
            {
                return await next(context);
            }
            catch (Chivalry2ConfigException error)
            {
                return ApiResult.Failure(error.Code, error.Message, statusCode: error.StatusCode);
            }
        });

        group.MapGet("/config/", async (Chivalry2Config config, CancellationToken cancellationToken) =>
        {
            var gameusersettings = await config.read("gameusersettings", cancellationToken);
            var game = await config.read("game", cancellationToken);
            return ApiResult.Success(null, null, new { gameusersettings, game });
        });

        foreach (var file in new[] { "gameusersettings", "game" })
        {
            group.MapGet($"/{file}/", async (Chivalry2Config config, CancellationToken cancellationToken) =>
                ApiResult.Success(null, null, await config.read(file, cancellationToken)));

            group.MapPatch($"/{file}/", async (HttpRequest request, Chivalry2Config config, CancellationToken cancellationToken) =>
            {
                var key = queryValue(request, "key", required: true)!;
                var value = queryValue(request, "value", required: true)!;
                var section = queryValue(request, "section");
                return ApiResult.Success(null, null, await config.set(file, key, value, section, cancellationToken));
            });
        }
    }

    private static string? queryValue(HttpRequest request, string name, bool required = false)
    {
        if (!request.Query.TryGetValue(name, out var values))
        {
            if (required) throw new Chivalry2ConfigException("INVALID_REQUEST", $"The {name} query parameter is required.");
            return null;
        }
        if (values.Count != 1) throw new Chivalry2ConfigException("INVALID_REQUEST", $"Supply exactly one {name} query parameter.");
        return values[0] ?? "";
    }
}
