using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Endpoints;

internal static class ConsoleInputEndpoints
{
    public static IEndpointRouteBuilder MapConsoleInputEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/v2/console/command", HandleRawCommandAsync);
        endpoints.MapPost("/v2/console/listplayers", HandleListPlayersAsync);
        endpoints.MapPost("/v2/console/batch", HandleBatchAsync);
        endpoints.MapPost("/v2/console/message", HandleMessageAsync);
        return endpoints;
    }

    private static async Task<IResult> HandleRawCommandAsync(
        RawConsoleCommandRequest request,
        ConsoleCommandService consoleCommandService,
        CancellationToken cancellationToken)
    {
        var result = await consoleCommandService.ExecuteRawAsync(
            request,
            cancellationToken).ConfigureAwait(false);
        return ApiResult.FromExecution(result);
    }

    private static async Task<IResult> HandleListPlayersAsync(
        ListPlayersRequest request,
        ConsoleCommandService consoleCommandService,
        CancellationToken cancellationToken)
    {
        var result = await consoleCommandService.ExecuteListPlayersAsync(
            request,
            cancellationToken).ConfigureAwait(false);
        return ApiResult.FromExecution(result);
    }

    private static async Task<IResult> HandleBatchAsync(
        ConsoleBatchRequest request,
        CommandTextBuilder commandTextBuilder,
        ConsoleCommandBatchService batchService,
        CancellationToken cancellationToken)
    {
        var build = commandTextBuilder.BuildBatch(request);
        if (!build.Ok)
        {
            return ApiResult.Failure(
                build.ErrorCode ?? "INVALID_REQUEST",
                build.ErrorMessage ?? "Invalid command batch.",
                build.RequestId);
        }

        var result = await batchService.ExecuteAsync(
            build.RequestId!,
            build.Commands!,
            request.RestoreTarget,
            request.Background == true,
            request.RequireIdle == true,
            cancellationToken).ConfigureAwait(false);
        return ApiResult.FromExecution(result);
    }

    private static async Task<IResult> HandleMessageAsync(
        ConsoleMessageRequest request,
        CommandTextBuilder commandTextBuilder,
        ConsoleCommandService consoleCommandService,
        CancellationToken cancellationToken)
    {
        var build = commandTextBuilder.BuildMessage(request);
        if (!build.Ok)
        {
            return ApiResult.Failure(
                build.ErrorCode ?? "INVALID_REQUEST",
                build.ErrorMessage ?? "Invalid message request.",
                build.RequestId);
        }

        var result = await consoleCommandService.ExecuteCommandAsync(
            build.RequestId!,
            build.Command!,
            expectClipboard: false,
            request.RestoreTarget,
            request.Background == true,
            request.RequireIdle == true,
            cancellationToken).ConfigureAwait(false);
        return ApiResult.FromExecution(result);
    }
}
