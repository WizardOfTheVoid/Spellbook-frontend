namespace SpellBook.Telemetry;
public static class UpdateStream
{
    public static async Task Write(HttpContext context, string id, RecordingCatalog catalog, string? generation, long after)
    {
        context.Response.ContentType = "application/x-ndjson";
        context.Response.Headers.CacheControl = "no-store";
        using var subscription=CommittedUpdates.Subscribe(id);
        while (!context.RequestAborted.IsCancellationRequested)
        {
            var status = catalog.Get(id);
            if (status.Generation != generation || status.UpdateSequence > after)
            {
                var resync = status.Generation != generation || status.UpdateSequence != after + 1;
                var update = new TelemetryUpdate(Wire.Version,id,status.Revision,status.Cursor,status.Head,resync ? "resync" : "changed",status.State);
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
                timeout.CancelAfter(TimeSpan.FromSeconds(5));
                await context.Response.WriteAsync(Wire.Serialize(update) + "\n",timeout.Token);
                await context.Response.Body.FlushAsync(timeout.Token);
                generation = status.Generation; after = status.UpdateSequence;
            }
            await subscription.Wait(context.RequestAborted);
        }
    }
}
