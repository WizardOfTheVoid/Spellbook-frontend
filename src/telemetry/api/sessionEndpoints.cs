namespace SpellBook.Telemetry;
public static class SessionEndpoints
{
    public static void Map(RouteGroupBuilder group, TelemetryOrchestrator runtime, RecordingReprocessJob jobs)
    {
        group.MapPost("/recordings", async (StartRecordingRequest request) =>
        {
            if (jobs.IsBusy) throw new InvalidOperationException("Wait for recording job completion");
            return await runtime.StartRecording(request,CancellationToken.None);
        });
        group.MapPost("/recordings/{id}/stop", (string id) => runtime.StopRecording(id,CancellationToken.None));
    }
}
