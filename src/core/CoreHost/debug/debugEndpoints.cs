using CoreHost.Actions;
using CoreHost.Models;

namespace CoreHost.Debug;

public sealed record DebugSessionRequest(bool Enabled);
public sealed record DebugQueueRequest(string Operation, string? Id = null);
public sealed record DebugSettingsRequest(Dictionary<string, double>? Values = null, bool Save = false, bool Reset = false);

public static class DebugEndpoints
{
    public static void mapDebugEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/v3/debug", (HttpRequest request, CoreDebug debug) =>
        {
            var cursor = request.Query["after"];
            if (cursor.Count == 0) return ApiResult.Success(null, null, debug.snapshot(0));
            return cursor.Count == 1 && long.TryParse(cursor, out var after) && after >= 0
                ? ApiResult.Success(null, null, debug.snapshot(after))
                : ApiResult.Failure("INVALID_DEBUG_CURSOR", "The event cursor must be a non-negative integer.");
        });
        endpoints.MapPost("/v3/debug/session", (DebugSessionRequest request, DebugShortcuts shortcuts, DebugJournal journal) =>
        {
            shortcuts.setEnabled(request.Enabled);
            return ApiResult.Success(null, null, new { armed = shortcuts.armed, sequence = journal.read(long.MaxValue).Sequence });
        });
        endpoints.MapPost("/v3/debug/queue", (DebugQueueRequest request, ActionQueue queue) =>
        {
            if (!queue.control(request.Operation, request.Id, out var found))
                return ApiResult.Failure("INVALID_QUEUE_CONTROL", "Use pause, resume, step, stop, or cancel with an Action id.");
            var snapshot = queue.debugSnapshot(Environment.TickCount64);
            return ApiResult.Success(null, null, new { snapshot.Paused, snapshot.Actions, found = request.Operation == "cancel" ? found : (bool?)null });
        });
        endpoints.MapPatch("/v3/debug/settings", (DebugSettingsRequest request, DebugTimingSettings settings) =>
        {
            try
            {
                settings.update(request.Values, request.Save, request.Reset);
                return ApiResult.Success(null, null, settings.snapshot());
            }
            catch (ArgumentException exception) { return ApiResult.Failure("INVALID_DEBUG_SETTINGS", exception.Message); }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or InvalidOperationException)
            { return ApiResult.Failure("DEBUG_SETTINGS_SAVE_FAILED", "The timing settings could not be saved to the active Core .env.", statusCode: 500); }
        });
    }
}
