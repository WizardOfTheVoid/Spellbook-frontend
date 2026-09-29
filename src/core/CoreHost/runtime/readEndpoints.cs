using CoreHost.Models;
using CoreHost.Services;
using CoreHost.Snapshot;

namespace CoreHost.Runtime;

public static class ReadEndpoints
{
    public static void mapReadEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/v2/native/listplayers", (NativeListPlayersRequest request, NativeListPlayersService native) => ApiResult.FromExecution(native.Execute(request.Id)));
        endpoints.MapPost("/v2/console/snapshot", async (SnapshotRequest request, SnapshotService snapshot, CancellationToken cancellationToken) =>
        {
            if (!RequestValidators.TryNormalizeRequestId(request.Id, out var id, out var error)) return ApiResult.Failure("INVALID_REQUEST", error!, request.Id);
            return ApiResult.FromExecution(await snapshot.CaptureTextAsync(id, cancellationToken));
        });
    }
}
