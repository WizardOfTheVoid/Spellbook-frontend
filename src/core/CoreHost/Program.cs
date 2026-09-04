using System.Net;
using CoreHost.Endpoints;
using CoreHost.Middleware;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Snapshot;
using Microsoft.Extensions.Options;

EnvFile.Load(
    Path.Combine(Directory.GetCurrentDirectory(), "src", "core", "CoreHost", ".env"),
    Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".env")),
    Path.Combine(AppContext.BaseDirectory, ".env"),
    Path.Combine(Directory.GetCurrentDirectory(), ".env"));

var builder = WebApplication.CreateBuilder(args);
var startupOptions = builder.Configuration.Get<CoreHostOptions>() ?? new CoreHostOptions();

builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.Listen(IPAddress.Parse(startupOptions.Core.Host), startupOptions.Core.Port);
});

builder.Services.AddCoreHostServices(builder.Configuration);

var app = builder.Build();

app.UseMiddleware<CompactRequestLoggingMiddleware>();

app.Use(async (context, next) =>
{
    var requiresPostAuth = context.Request.Path.StartsWithSegments("/v2/console") ||
        context.Request.Path.StartsWithSegments("/v2/input") ||
        context.Request.Path.StartsWithSegments("/v2/native");
    var requiresReadyAuth = HttpMethods.IsGet(context.Request.Method) &&
        context.Request.Path == "/v2/runtime/ready";
    if ((HttpMethods.IsPost(context.Request.Method) && requiresPostAuth) || requiresReadyAuth)
    {
        var options = context.RequestServices.GetRequiredService<IOptions<CoreHostOptions>>().Value;
        var suppliedToken = context.Request.Headers.TryGetValue("X-Chiv-Admin-Token", out var header)
            ? header.ToString()
            : null;
        if (!CoreRequestAuthorization.IsAuthorized(suppliedToken, options.Core.AuthToken))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await context.Response.WriteAsJsonAsync(ApiResult.FailureEnvelope("UNAUTHORIZED", "Missing or invalid X-Chiv-Admin-Token header."));
            return;
        }
    }

    await next(context);
});

app.MapGet("/v2/health", (GameProcessService gameProcessService, ForegroundWindowService foregroundWindowService, ConsoleCommandService consoleCommandService, IOptions<CoreHostOptions> options) =>
{
    var lookup = gameProcessService.GetTargetProcess();
    var config = options.Value;
    var process = lookup.Process;
    var foregroundWindowHandle = foregroundWindowService.GetForegroundWindow();
    var gameWindowHandle = process?.WindowHandle ?? IntPtr.Zero;
    var gameIsFocused = lookup.Success && gameWindowHandle != IntPtr.Zero && foregroundWindowHandle == gameWindowHandle;

    var data = new
    {
        core = new
        {
            version = ProductVersion.Value,
            transport = "foreground-console-automation",
            apiHost = config.Core.Host,
            apiPort = config.Core.Port,
            running = true
        },
        focus = new
        {
            gameIsFocused,
            foregroundWindowHandle = ToHandleText(foregroundWindowHandle),
            gameWindowHandle = gameWindowHandle == IntPtr.Zero ? null : ToHandleText(gameWindowHandle)
        },
        gameRunning = lookup.Success,
        process,
        binary = process?.Binary,
        processStatus = lookup.Success ? null : new
        {
            code = lookup.ErrorCode,
            message = lookup.ErrorMessage
        },
        lastListPlayers = consoleCommandService.GetLastListPlayersSummary()
    };

    return ApiResult.Success(null, null, data);
});

app.MapGet("/v2/runtime/ready", (IOptions<CoreHostOptions> options) =>
    ApiResult.Success(null, null, CoreRuntimeIdentity.Create(options.Value)));

app.MapGet("/v2/meta/get", (
    GameProcessService gameProcessService,
    ForegroundWindowService foregroundWindowService,
    MovementActivityTracker movementActivity) =>
{
    var lookup = gameProcessService.GetTargetProcess();
    var gameWindowHandle = lookup.Process?.WindowHandle ?? IntPtr.Zero;
    var gameIsFocused = lookup.Success &&
        gameWindowHandle != IntPtr.Zero &&
        foregroundWindowService.GetForegroundWindow() == gameWindowHandle;

    return ApiResult.Success(null, null, new
    {
        gameRunning = lookup.Success,
        focus = new { gameIsFocused },
        movement = movementActivity.GetSnapshot()
    });
});

app.MapConsoleInputEndpoints();

app.MapPost("/v2/input/key", async (
    KeyPressRequest request,
    KeyPressService keyPressService,
    CancellationToken cancellationToken) =>
{
    var result = await keyPressService.ExecuteAsync(
        request,
        cancellationToken).ConfigureAwait(false);
    return ApiResult.FromExecution(result);
});

app.MapPost("/v2/input/sequence", async (
    KeySequenceRequest request,
    KeyPressService keyPressService,
    CancellationToken cancellationToken) =>
{
    var result = await keyPressService.ExecuteSequenceAsync(
        request,
        cancellationToken).ConfigureAwait(false);
    return ApiResult.FromExecution(result);
});

app.MapPost("/v2/native/listplayers", (NativeListPlayersRequest request, NativeListPlayersService nativeListPlayers) =>
    ApiResult.FromExecution(nativeListPlayers.Execute(request.Id)));

app.MapPost("/v2/console/snapshot", async (SnapshotRequest request, SnapshotService snapshotService, CancellationToken cancellationToken) =>
{
    if (!RequestValidators.TryNormalizeRequestId(request.Id, out var requestId, out var idError))
    {
        return ApiResult.Failure("INVALID_REQUEST", idError!, request.Id);
    }

    var result = await snapshotService.CaptureTextAsync(requestId, cancellationToken).ConfigureAwait(false);
    return ApiResult.FromExecution(result);
});

app.MapPost("/v2/console/ban", async (BanRequest request, CommandTextBuilder commandTextBuilder, ConsoleCommandService consoleCommandService, CancellationToken cancellationToken) =>
{
    var build = commandTextBuilder.BuildBan(request);
    if (!build.Ok)
    {
        return ApiResult.Failure(build.ErrorCode ?? "INVALID_REQUEST", build.ErrorMessage ?? "Invalid ban request.", build.RequestId);
    }

    var result = await consoleCommandService.ExecuteCommandAsync(
        build.RequestId!,
        build.Command!,
        expectClipboard: false,
        request.RestoreTarget,
        cancellationToken).ConfigureAwait(false);
    return ApiResult.FromExecution(result);
});

app.MapPost("/v2/console/kick", async (KickRequest request, CommandTextBuilder commandTextBuilder, ConsoleCommandService consoleCommandService, CancellationToken cancellationToken) =>
{
    var build = commandTextBuilder.BuildKick(request);
    if (!build.Ok)
    {
        return ApiResult.Failure(build.ErrorCode ?? "INVALID_REQUEST", build.ErrorMessage ?? "Invalid kick request.", build.RequestId);
    }

    var result = await consoleCommandService.ExecuteCommandAsync(
        build.RequestId!,
        build.Command!,
        expectClipboard: false,
        request.RestoreTarget,
        cancellationToken).ConfigureAwait(false);
    return ApiResult.FromExecution(result);
});

app.MapPost("/v2/console/unban", async (UnbanRequest request, CommandTextBuilder commandTextBuilder, ConsoleCommandBatchService consoleCommandBatchService, CancellationToken cancellationToken) =>
{
    var build = commandTextBuilder.BuildUnban(request);
    if (!build.Ok)
    {
        return ApiResult.Failure(build.ErrorCode ?? "INVALID_REQUEST", build.ErrorMessage ?? "Invalid unban request.", build.RequestId);
    }

    var commands = CommandTextBuilder.BuildUnbanCommands(request.PlayfabId!.Trim())
        .Select(command => new PreparedConsoleCommand("unban", command, 0))
        .ToArray();
    var result = await consoleCommandBatchService.ExecuteAsync(
        build.RequestId!,
        commands,
        request.RestoreTarget,
        cancellationToken).ConfigureAwait(false);
    return ApiResult.FromExecution(result);
});

app.MapPost("/v2/console/warn", async (WarnRequest request, CommandTextBuilder commandTextBuilder, ConsoleCommandService consoleCommandService, CancellationToken cancellationToken) =>
{
    var build = commandTextBuilder.BuildWarn(request);
    if (!build.Ok)
    {
        return ApiResult.Failure(build.ErrorCode ?? "INVALID_REQUEST", build.ErrorMessage ?? "Invalid warn request.", build.RequestId);
    }

    var result = await consoleCommandService.ExecuteCommandAsync(
        build.RequestId!,
        build.Command!,
        expectClipboard: false,
        request.RestoreTarget,
        cancellationToken).ConfigureAwait(false);
    return ApiResult.FromExecution(result);
});

app.Run();

static string ToHandleText(IntPtr windowHandle)
{
    return $"0x{windowHandle.ToInt64():X16}";
}

static class EnvFile
{
    public static void Load(params string[] candidatePaths)
    {
        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var candidatePath in candidatePaths)
        {
            if (string.IsNullOrWhiteSpace(candidatePath))
            {
                continue;
            }

            var path = Path.GetFullPath(candidatePath);
            if (!seenPaths.Add(path) || !File.Exists(path))
            {
                continue;
            }

            foreach (var line in File.ReadAllLines(path))
            {
                SetVariable(line);
            }
        }
    }

    private static void SetVariable(string line)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0 || trimmed.StartsWith('#'))
        {
            return;
        }

        const string exportPrefix = "export ";
        if (trimmed.StartsWith(exportPrefix, StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[exportPrefix.Length..].TrimStart();
        }

        var separatorIndex = trimmed.IndexOf('=');
        if (separatorIndex <= 0)
        {
            return;
        }

        var key = trimmed[..separatorIndex].Trim();
        var value = trimmed[(separatorIndex + 1)..].Trim();
        if (key.Length == 0 || Environment.GetEnvironmentVariable(key) is not null)
        {
            return;
        }

        Environment.SetEnvironmentVariable(key, Unquote(value));
    }

    private static string Unquote(string value)
    {
        if (value.Length >= 2 &&
            ((value[0] == '"' && value[^1] == '"') ||
            (value[0] == '\'' && value[^1] == '\'')))
        {
            return value[1..^1];
        }

        return value;
    }
}
