namespace SpellBook.Telemetry;
public static class MetadataEndpoints
{
    public static void Map(RouteGroupBuilder group, RecordingCatalog catalog, TelemetryOptions options, TelemetryOrchestrator runtime)
    {
        group.MapPost("/recordings/{id}/names",(string id, NameObservation[] names) =>
        {
            if (runtime.Active is not null) { runtime.AppendNames(id,names); return Results.Ok(); }
            var status = catalog.Get(id); using var writer = new RecordingOrchestrator(catalog.DataPath(id),status,options); writer.AppendNames(names); return Results.Ok();
        });
    }
}
