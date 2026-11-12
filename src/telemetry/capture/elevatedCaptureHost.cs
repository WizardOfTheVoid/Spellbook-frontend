using System.IO.Pipes;
using System.Text.Json;
namespace SpellBook.Telemetry;
public static class ElevatedCaptureHost
{
    public static async Task Run(string pipeName, int parentPid)
    {
        if (!pipeName.StartsWith("spellbook-telemetry-", StringComparison.Ordinal) || !Guid.TryParse(pipeName[20..], out _)) throw new ArgumentException("Invalid pipe name");
        using var lifetime = new CancellationTokenSource(TimeSpan.FromSeconds(40));
        _ = ParentLease.Watch(parentPid, lifetime);
        await using var pipe = CapturePipe.CreateClient(pipeName);
        await pipe.ConnectAsync(lifetime.Token);
        try
        {
            CapturePipe.ValidatePeer(pipe, parentPid, false);
            await CapturePipe.Write(pipe, new CaptureMessage("ready"), lifetime.Token);
            var request = JsonSerializer.Deserialize<CaptureRequest>(await CapturePipe.ReadLine(pipe, lifetime.Token) ?? "", Wire.Json) ?? throw new InvalidDataException("Missing request");
            using var native = new PktmonApi();
            var utc = native.Start(request.Endpoint, request.RecordingId);
            lifetime.CancelAfter(Timeout.InfiniteTimeSpan);
            await CapturePipe.Write(pipe, new CaptureMessage("started", StartedAtUtc: utc), lifetime.Token);
            var control = Task.Run(async () =>
            {
                try { await CapturePipe.ReadLine(pipe, lifetime.Token); }
                finally { native.Dispose(); }
            });
            await foreach (var packet in native.Queue.Reader.ReadAllAsync(lifetime.Token))
            {
                if (native.Error is not null) throw new IOException(native.Error);
                using var writeTimeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
                writeTimeout.CancelAfter(TimeSpan.FromSeconds(5));
                await CapturePipe.Write(pipe, new CaptureMessage("packet", packet), writeTimeout.Token);
            }
            await CapturePipe.Write(pipe, new CaptureMessage("stopped"), lifetime.Token);
            await control;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            try { await CapturePipe.Write(pipe, new CaptureMessage("error", Error: $"Capture failed ({ex.GetType().Name} 0x{ex.HResult:X8})"), CancellationToken.None); } catch (IOException) { }
        }
    }
}
