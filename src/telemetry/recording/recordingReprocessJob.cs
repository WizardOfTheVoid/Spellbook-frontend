using System.Collections.Concurrent;
using System.Text.Json;
namespace SpellBook.Telemetry;
public record ImportInput(string[] Files, string? Manifest = null, Endpoint? Endpoint = null);
public sealed class RecordingReprocessJob(TelemetryOptions options, RecordingCatalog catalog, TelemetryOrchestrator runtime)
{
    private readonly ConcurrentDictionary<string, (RecordingJob Job, CancellationTokenSource Cancel)> jobs = new();
    private readonly ConcurrentDictionary<string, ImportInput> inputs = new();
    private readonly object gate = new();
    private bool busy;
    public bool IsBusy { get { lock (gate) return busy; } }
    public string Register(ImportInput input)
    {
        if (input.Files.Length is 0 or > 128 || input.Files.Any(p=>!Path.IsPathFullyQualified(p) || !p.EndsWith(".pcapng",StringComparison.OrdinalIgnoreCase))) throw new ArgumentException("Choose PCAPNG files");
        if (input.Manifest is not null && (!Path.IsPathFullyQualified(input.Manifest) || new FileInfo(input.Manifest).Length > 65536)) throw new ArgumentException("Invalid capture manifest");
        if (input.Files.Sum(p=>new FileInfo(p).Length) > options.SessionLimit) throw new ArgumentException("Import exceeds recording limit");
        var id = Guid.NewGuid().ToString(); if (inputs.Count >= 8) inputs.Clear(); inputs[id] = input; return id;
    }
    public RecordingJob Get(string id) => jobs.TryGetValue(id,out var state) ? state.Job : throw new KeyNotFoundException("Job not found");
    public RecordingJob Cancel(string id) { if (jobs.TryGetValue(id,out var state)) state.Cancel.Cancel(); return Get(id); }
    public RecordingJob Import(string capability)
    {
        if (!inputs.TryRemove(capability,out var input)) throw new ArgumentException("Import input expired");
        var metadata = ImportMetadata.Read(input);
        var status = new RecordingStatus(Guid.NewGuid().ToString(),metadata.Endpoint) { StartedAtUtc = metadata.Start, State = "recording" };
        return Launch("import",status,input.Files,metadata.Start,false,metadata.Duration,metadata.Reason);
    }
    public RecordingJob Reprocess(string id)
    {
        var original = catalog.Get(id);
        var status = JsonSerializer.Deserialize<RecordingStatus>(Wire.Serialize(original),Wire.Json)!;
        var duration = original.Head.ElapsedUs;
        status.Generation = Guid.NewGuid().ToString(); status.Revision++; status.Head = new(); status.PacketCount = 0; status.SizeBytes = 0; status.LossCount = 0; status.UpdateSequence = 0; status.State = "recording";
        status.DecoderVersion = DecoderProfile.Version;
        var packetRoot = Path.Combine(catalog.PathFor(id),"packets");
        var files=Directory.Exists(packetRoot)?Directory.GetFiles(packetRoot,"*.pcapng").Order().ToArray():[];
        if(files.Length==0) throw new InvalidDataException("Raw packets are missing; the saved view is preserved");
        return Launch("reprocess",status,files,status.StartedAtUtc,true,duration,original.StopReason ?? "reprocessed");
    }
    private RecordingJob Launch(string kind, RecordingStatus status, string[] files, DateTimeOffset? start, bool reprocess,long duration = 0,string reason = "imported")
    {
        lock (gate)
        {
            if (busy || runtime.Active is not null) throw new InvalidOperationException("Stop capture and wait for the current job");
            runtime.ReserveJob();
            busy = true;
        }
        var job = new RecordingJob(Guid.NewGuid().ToString(),status.Id,kind);
        var cancel = new CancellationTokenSource(); jobs[job.Id] = (job,cancel);
        _ = Task.Run(async () =>
        {
            var root = reprocess ? Path.Combine(catalog.PathFor(status.Id),"derived",status.Generation) : catalog.PathFor(status.Id);
            try
            {
                job.State = "running"; catalog.CheckStorage(true);
                var names=reprocess?ReadNames(catalog.DataPath(status.Id)):[];
                using var writer = new RecordingOrchestrator(root,status,options);
                var decoder = new DecodingOrchestrator(status.Endpoint); var tracker = new TrackingOrchestrator(); long ordinal = 0, elapsed = 0,accounted=0;
                foreach (var file in files)
                foreach (var original in PacketLog.Read(file,start))
                {
                    cancel.Token.ThrowIfCancellationRequested();
                    start ??= original.Timestamp; status.StartedAtUtc = start;
                    var packet = original with { Ordinal = reprocess&&original.HasCaptureClock?original.Ordinal:ordinal++, ElapsedUs = Math.Max(elapsed,original.HasCaptureClock ? original.ElapsedUs : (original.Timestamp - start.Value).Ticks / 10) };
                    elapsed = packet.ElapsedUs;
                    await writer.Append(packet,decoder.Accept(packet).SelectMany(d=>tracker.Apply(d,packet)).ToArray());
                    job.Processed++;
                    if (writer.ShouldFlush) await writer.Flush(elapsed);
                    if (job.Processed % 256 == 0) {catalog.Account(status.SizeBytes-accounted);accounted=status.SizeBytes;catalog.CheckStorage();}
                }
                job.Total = job.Processed;
                await writer.Complete(reason,Math.Max(elapsed,duration));
                writer.PreserveNames(names);
                if (reprocess)
                {
                    AtomicRecordingFile.Write(Path.Combine(catalog.PathFor(status.Id),"view.json"),Wire.Serialize(status.Generation));
                    CommittedUpdates.Publish(root,status);
                }
                catalog.CheckStorage(true);
                job.State = "completed";
            }
            catch (OperationCanceledException) { job.State = "cancelled"; }
            catch (Exception ex) { job.State = "failed"; job.Error = ex is ArgumentException or InvalidDataException ? ex.Message : "Recording job failed; previous view is preserved"; }
            finally
            {
                try { if (!reprocess && job.State is "cancelled" or "failed") RecordingRecovery.MarkInterrupted(root); }
                finally { runtime.ReleaseJob(); lock (gate) busy = false; }
            }
        });
        return job;
    }
    private static IReadOnlyList<NameObservation> ReadNames(string root)
    {
        using var connection=RecordingDatabase.Open(root,true);
        using var command=connection.CreateCommand();command.CommandText="SELECT json FROM names";
        using var rows=command.ExecuteReader();var names=new List<NameObservation>();
        while(rows.Read()) names.Add(JsonSerializer.Deserialize<NameObservation>(rows.GetString(0),Wire.Json)!);
        return names;
    }
}
