namespace SpellBook.Telemetry;
public static class ApiOrchestrator
{
    public static void Map(WebApplication app, TelemetryOptions options, RecordingCatalog catalog, TelemetryOrchestrator runtime, RecordingReprocessJob jobs)
    {
        app.Use(async (context,next) =>
        {
            if (!RequestAuthorization.Allowed(context.Request,options.Token)) { context.Response.StatusCode = 401; return; }
            try { await next(context); }
            catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested) { }
            catch (Exception ex) when (!context.Response.HasStarted)
            {
                var code = ex is ReadViewMismatchException ? "RESYNC_REQUIRED" : ex is ArgumentException or InvalidDataException ? "INVALID_REQUEST" : ex is KeyNotFoundException ? "NOT_FOUND" : ex is InvalidOperationException ? "CONFLICT" : "WORKER_ERROR";
                var status = code == "INVALID_REQUEST" ? 400 : code == "NOT_FOUND" ? 404 : code is "CONFLICT" or "RESYNC_REQUIRED" ? 409 : 500;
                await Results.Problem(statusCode:status,title:code,detail:status < 500 || ex is CaptureStartupException ? ex.Message : "Telemetry worker request failed",extensions:new Dictionary<string,object?> { ["code"] = code }).ExecuteAsync(context);
            }
        });
        var group = app.MapGroup("/v1");
        group.MapGet("/status",()=>new { protocolVersion = Wire.Version, instanceId = options.InstanceId, processId = Environment.ProcessId, version = options.Version, capture = PktmonApi.Probe(), active = runtime.Active, error = runtime.LastError });
        SessionEndpoints.Map(group,runtime,jobs); RecordingEndpoints.Map(group,catalog,jobs); MetadataEndpoints.Map(group,catalog,options,runtime); PlaybackEndpoints.Map(group,catalog);
    }
}
