using System.Buffers.Binary;
namespace SpellBook.Telemetry;
public class CapturePipeTests
{
    [Fact] public async Task FramesMessagesWithABoundedLengthPrefix()
    {
        using var stream = new MemoryStream();
        await CapturePipe.Write(stream,new CaptureMessage("stopped"),TestContext.Current.CancellationToken);
        var bytes=stream.ToArray();
        Assert.Equal(bytes.Length-4,BinaryPrimitives.ReadInt32LittleEndian(bytes));
        stream.Position=0;
        Assert.Contains("stopped",await CapturePipe.ReadLine(stream,TestContext.Current.CancellationToken));
        Assert.Null(await CapturePipe.ReadLine(stream,TestContext.Current.CancellationToken));
    }
}
