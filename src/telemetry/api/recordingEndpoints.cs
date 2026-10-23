namespace SpellBook.Telemetry;
public static class RecordingEndpoints
{
    public record CapabilityRequest(string Capability);
    public static void Map(RouteGroupBuilder group, RecordingCatalog catalog, RecordingReprocessJob jobs)
    {
        group.MapGet("/recordings",catalog.List);
        group.MapPost("/import-inputs",(ImportInput input) => new { capability = jobs.Register(input) });
        group.MapPost("/imports",(CapabilityRequest request) => jobs.Import(request.Capability));
        group.MapPost("/recordings/{id}/reprocess",(string id)=>jobs.Reprocess(id));
        group.MapGet("/jobs/{id}",(string id)=>jobs.Get(id));
        group.MapPost("/jobs/{id}/cancel",(string id)=>jobs.Cancel(id));
    }
}
