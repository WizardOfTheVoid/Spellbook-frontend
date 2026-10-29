using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
namespace SpellBook.Telemetry;
public sealed class CaptureStartupException(string stage, Exception cause) : IOException($"Capture startup failed at {stage} ({cause.GetType().Name}, 0x{cause.HResult:X8}){(cause is CaptureHelperException ? $": {cause.Message}" : "")}", cause);
public sealed class CaptureHelperException(string message) : IOException(message);
public interface ICaptureSource : IAsyncDisposable
{
    Task<CaptureStarted> Start(CaptureRequest request,CancellationToken ct);
    Task<CaptureMessage> Read(CancellationToken ct);
    Task Stop(CancellationToken ct);
}
public sealed class CaptureOrchestrator : ICaptureSource
{
    private NamedPipeServerStream? pipe;
    private Process? helper;
    public async Task<CaptureStarted> Start(CaptureRequest request, CancellationToken ct)
    {
        if (!request.Endpoint.IsValid) throw new ArgumentException("Invalid endpoint");
        var name = $"spellbook-telemetry-{Guid.NewGuid()}";
        pipe = CapturePipe.CreateServer(name);
        var info = new ProcessStartInfo(Path.Combine(AppContext.BaseDirectory, "SpellBook.Telemetry.exe")) { UseShellExecute = true, Verb = "runas", WindowStyle = ProcessWindowStyle.Hidden };
        info.ArgumentList.Add("--capture-host"); info.ArgumentList.Add(name); info.ArgumentList.Add(Environment.ProcessId.ToString());
        var stage = "elevation";
        try
        {
            helper = await Task.Run(() => Process.Start(info), CancellationToken.None) ?? throw new InvalidOperationException("Capture helper did not start");
            stage = "pipe connection";
            ct.ThrowIfCancellationRequested();
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
            await pipe.WaitForConnectionAsync(timeout.Token);
            stage = "peer verification";
            CapturePipe.ValidatePeer(pipe, helper.Id, true);
            stage = "helper handshake";
            var ready = await Read(timeout.Token);
            if (ready.Kind != "ready") throw new CaptureHelperException(ready.Error ?? "Capture helper did not become ready");
            await CapturePipe.Write(pipe, request, timeout.Token);
            stage = "native activation";
            var message = await Read(timeout.Token);
            if (message.Kind != "started" || message.StartedAtUtc is null) throw new CaptureHelperException(message.Error ?? "Capture failed to activate");
            return new(message.StartedAtUtc.Value);
        }
        catch (Exception ex) { await DisposeAsync(); throw new CaptureStartupException(stage,ex); }
    }
    public async Task<CaptureMessage> Read(CancellationToken ct)
    {
        var line = await CapturePipe.ReadLine(pipe ?? throw new InvalidOperationException("Capture is not active"), ct);
        return line is null ? new("stopped") : JsonSerializer.Deserialize<CaptureMessage>(line, Wire.Json) ?? throw new InvalidDataException("Invalid capture message");
    }
    public async Task Stop(CancellationToken ct)
    {
        if (pipe?.IsConnected == true) await CapturePipe.Write(pipe, new { kind = "stop" }, ct);
    }
    public async ValueTask DisposeAsync()
    {
        if (pipe is not null) { await pipe.DisposeAsync(); pipe = null; }
        if (helper is not null)
        {
            try { using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5)); await helper.WaitForExitAsync(timeout.Token); }
            catch (OperationCanceledException) { try { helper.Kill(); } catch (InvalidOperationException) { } }
            helper.Dispose(); helper = null;
        }
    }
}
