namespace SpellBook.Telemetry;
public static class PlaybackEndpoints
{
    public static void Map(RouteGroupBuilder group, RecordingCatalog catalog)
    {
        group.MapGet("/recordings/{id}/frame",(string id, long atUs, string? trackId,CancellationToken ct)=>new PlaybackOrchestrator(catalog.DataPath(id)).GetFrame(catalog.Get(id),atUs,ct,trackId));
        group.MapPost("/recordings/{id}/trajectories",(string id, TrajectoryQuery query, CancellationToken ct)=>new PlaybackOrchestrator(catalog.DataPath(id)).GetTrajectories(query with { RecordingId = id },ct));
        group.MapPost("/recordings/{id}/events",(string id, EventQuery query, CancellationToken ct)=>new PlaybackOrchestrator(catalog.DataPath(id)).GetEvents(query with { RecordingId = id },ct));
        group.MapPost("/recordings/{id}/players",(string id,PlayerQuery query,CancellationToken ct)=>new PlaybackOrchestrator(catalog.DataPath(id)).GetPlayers(query with {RecordingId=id},ct));
        group.MapPost("/recordings/{id}/metrics",(string id,MetricHistoryQuery query,CancellationToken ct)=>new PlaybackOrchestrator(catalog.DataPath(id)).GetMetricHistory(query with {RecordingId=id},ct));
        group.MapGet("/recordings/{id}/updates",(HttpContext context, string id, string? generation, long? afterSequence)=>UpdateStream.Write(context,id,catalog,generation,afterSequence ?? -1));
    }
}
