using System.Threading.Channels;
namespace SpellBook.Telemetry;
public class TelemetryOrchestratorTests
{
    [Fact] public async Task RejectingASecondStartKeepsTheExistingCaptureAlive()
    {
        var root=TestWorkspace.Create();
        try
        {
            var options=new TelemetryOptions(root,"unused",Guid.NewGuid().ToString(),Environment.ProcessId,"test"){FreeSpaceFloor=0};
            var source=new FakeCapture();
            await using var runtime=new TelemetryOrchestrator(options,new(options),()=>source);
            var recording=await runtime.StartRecording(new(new("127.0.0.1",7777)),TestContext.Current.CancellationToken);
            await Assert.ThrowsAsync<InvalidOperationException>(()=>runtime.StartRecording(new(new("127.0.0.1",7777)),TestContext.Current.CancellationToken));
            Assert.Equal(recording.Id,runtime.Active?.Id);
            Assert.Equal(0,source.Disposals);
        }
        finally { Directory.Delete(root,true); }
    }
    private sealed class FakeCapture : ICaptureSource
    {
        private readonly Channel<CaptureMessage> messages=Channel.CreateUnbounded<CaptureMessage>();
        public int Disposals;
        public Task<CaptureStarted> Start(CaptureRequest request,CancellationToken ct)=>Task.FromResult(new CaptureStarted(DateTimeOffset.UtcNow));
        public async Task<CaptureMessage> Read(CancellationToken ct)=>await messages.Reader.WaitToReadAsync(ct) ? await messages.Reader.ReadAsync(ct) : new("stopped");
        public Task Stop(CancellationToken ct){messages.Writer.TryWrite(new("stopped"));return Task.CompletedTask;}
        public ValueTask DisposeAsync(){Disposals++;messages.Writer.TryComplete();return ValueTask.CompletedTask;}
    }
}
