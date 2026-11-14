namespace SpellBook.Telemetry;
public sealed class TelemetryOrchestrator(TelemetryOptions options, RecordingCatalog catalog,Func<ICaptureSource>? createCapture = null) : IAsyncDisposable
{
    private readonly SemaphoreSlim gate = new(1);
    private readonly object operationGate = new();
    private bool jobReserved;
    private CancellationTokenSource? starting;
    private ICaptureSource? capture;
    private Task? pipeline;
    private string stopReason = "requested";
    private RecordingOrchestrator? activeWriter;
    public RecordingStatus? Active { get; private set; }
    public string? LastError { get; private set; }
    public void ReserveJob()
    {
        lock (operationGate)
        {
            if (jobReserved || Active is not null) throw new InvalidOperationException("Stop capture and wait for the current job");
            jobReserved = true;
        }
    }
    public void ReleaseJob() { lock (operationGate) jobReserved = false; }
    public async Task<RecordingStatus> StartRecording(StartRecordingRequest request, CancellationToken ct)
    {
        await gate.WaitAsync(ct);
        var ownsStart = false;
        try
        {
            if (!request.Endpoint.IsValid) throw new ArgumentException("Invalid server endpoint");
            catalog.CheckStorage(true);
            lock (operationGate)
            {
                if (Active is not null || jobReserved) throw new InvalidOperationException("A recording or decoding job is already active");
                Active = new(Guid.NewGuid().ToString(),request.Endpoint); ownsStart = true;
            }
            LastError = null;
            starting = CancellationTokenSource.CreateLinkedTokenSource(ct);
            capture = createCapture?.Invoke() ?? new CaptureOrchestrator(); stopReason = "requested";
            var began = await capture.Start(new(request.Endpoint,Active.Id),starting.Token);
            Active.StartedAtUtc = began.StartedAtUtc; Active.State = "recording";
            var writer = new RecordingOrchestrator(catalog.PathFor(Active.Id),Active,options);
            activeWriter = writer;
            await writer.Flush(0);
            pipeline = Task.Run(() => Run(capture,writer,Active));
            return Active;
        }
        catch { if (ownsStart) { if (capture is not null) await capture.DisposeAsync(); capture = null; lock (operationGate) Active = null; } throw; }
        finally { starting?.Dispose(); starting = null; gate.Release(); }
    }
    private async Task Run(ICaptureSource source, RecordingOrchestrator writer, RecordingStatus status)
    {
        var queue = new PacketQueue();
        var decoder = new DecodingOrchestrator(status.Endpoint); var tracker = new TrackingOrchestrator();
        var clock = new RecordingClock(); clock.Start(status.StartedAtUtc!.Value);
        var intake = Task.Run(async () =>
        {
            try
            {
                while (true)
                {
                    var message = await source.Read(CancellationToken.None);
                    if (message.Kind == "stopped") break;
                    if (message.Kind == "error") throw new IOException(message.Error);
                    if (message.Packet is { } packet) queue.Accept(packet);
                }
            }
            finally { queue.Complete(); }
        });
        try
        {
            var read = queue.Reader.WaitToReadAsync().AsTask();
            long accounted=0;
            while (true)
            {
                if(!read.IsCompleted) await Task.WhenAny(read, Task.Delay(writer.HasPending?100:1000));
                var drain=System.Diagnostics.Stopwatch.StartNew();
                var count=0;
                while (count++<256 && drain.ElapsedMilliseconds<10 && queue.Reader.TryRead(out var packet))
                {
                    var rows = decoder.Accept(packet).SelectMany(d=>tracker.Apply(d,packet)).ToArray();
                    await writer.Append(packet,rows);
                }
                if(writer.ShouldFlush || writer.ShouldWatermark) await writer.Flush(clock.ElapsedUs);
                catalog.Account(status.SizeBytes-accounted);accounted=status.SizeBytes;
                catalog.CheckStorage();
                if (read.IsCompleted && !await read) break;
                if (read.IsCompleted) read = queue.Reader.WaitToReadAsync().AsTask();
            }
            await intake;
            await writer.Complete(stopReason,clock.ElapsedUs);
        }
        catch (Exception ex)
        {
            LastError = $"{ex.GetType().Name}: {ex.Message}";
            stopReason = ex.Message == "storageLimitReached" ? "storageLimitReached" : "interrupted";
            try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(3)); await source.Stop(timeout.Token); } catch (Exception) { }
            try { await writer.Complete(stopReason,clock.ElapsedUs); } catch (Exception finish) { status.State = "interrupted"; LastError += $"; Finalization: {finish.Message}"; }
        }
        finally
        {
            writer.Dispose(); await source.DisposeAsync();
            lock (operationGate) Active = null;
            capture = null; activeWriter = null;
        }
    }
    public void AppendNames(string id, IReadOnlyList<NameObservation> names)
    {
        if (Active?.Id != id || activeWriter is null) throw new InvalidOperationException("Recording is not active");
        activeWriter.AppendNames(names);
    }
    public async Task<RecordingStatus> StopRecording(string id, CancellationToken ct)
    {
        starting?.Cancel();
        await gate.WaitAsync(ct);
        try
        {
            if (Active is null || Active.Id != id) return catalog.Get(id);
            Active.State = "stopping";
            if (capture is not null) await capture.Stop(ct);
            if (pipeline is not null) await pipeline.WaitAsync(ct);
            return catalog.Get(id);
        }
        finally { gate.Release(); }
    }
    public async ValueTask DisposeAsync()
    {
        starting?.Cancel();
        if (Active is { } status) { stopReason = "applicationExit"; using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8)); try { await StopRecording(status.Id,timeout.Token); } catch { } }
        if (capture is not null) await capture.DisposeAsync();
        if (pipeline is not null) { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(8)); try { await pipeline.WaitAsync(timeout.Token); } catch (OperationCanceledException) { } }
    }
}
