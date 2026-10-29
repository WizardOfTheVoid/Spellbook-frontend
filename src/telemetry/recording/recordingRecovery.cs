using System.Text.Json;
namespace SpellBook.Telemetry;
public static class RecordingRecovery
{
    public static void Run(RecordingCatalog catalog)
    {
        foreach (var status in catalog.List())
        {
            try
            {
                var root=catalog.DataPath(status.Id);
                using(var read=RecordingDatabase.Open(root,true))
                    if(!RecordingDatabase.HasProjection(read)) continue;
                using var connection=RecordingDatabase.Open(root);
                RecordingDatabase.Initialize(connection);
            }
            catch(Exception error) when(error is IOException or UnauthorizedAccessException or Microsoft.Data.Sqlite.SqliteException)
            {
                Console.Error.WriteLine($"Optional query index upgrade skipped for {status.Id}: {error.Message}");
            }
        }
        foreach (var status in catalog.List().Where(s=>s.State is "starting" or "recording" or "stopping"))
        {
            MarkInterrupted(catalog.DataPath(status.Id),status);
        }
    }
    public static void MarkInterrupted(string root,RecordingStatus? status = null)
    {
            if (!File.Exists(Path.Combine(root,"telemetry.sqlite"))) return;
            status ??= RecordingDatabase.Status(root);
            if (status is null || status.State is not ("starting" or "recording" or "stopping")) return;
            status.State = "interrupted"; status.StopReason = "Worker exited before finalization; uncommitted tail may be absent";
            status.StoppedAtUtc = status.StartedAtUtc?.AddTicks(status.Head.ElapsedUs * 10);
            status.Revision++; status.UpdateSequence++;
            using var c = RecordingDatabase.Open(root); using var cmd = c.CreateCommand(); cmd.CommandText = "UPDATE state SET json=$json WHERE id=1";
            cmd.Parameters.AddWithValue("$json",Wire.Serialize(status)); cmd.ExecuteNonQuery();
            File.WriteAllText(Path.Combine(root,"manifest.json"),Wire.Serialize(status));
    }
}
