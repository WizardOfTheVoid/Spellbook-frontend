using System.Threading.Channels;
namespace SpellBook.Telemetry;
public sealed class PacketQueue(int capacity = 2048)
{
    private readonly Channel<PacketEnvelope> channel = Channel.CreateBounded<PacketEnvelope>(new BoundedChannelOptions(capacity) { FullMode = BoundedChannelFullMode.Wait, SingleReader = true });
    private long pendingLoss;
    private PacketEnvelope? last;
    private bool closing;
    public ChannelReader<PacketEnvelope> Reader => channel.Reader;
    public void Accept(PacketEnvelope packet)
    {
        lock (channel)
        {
            if (closing) return;
            last = packet;
            var item = packet with { LossCount = packet.LossCount + pendingLoss };
            if (channel.Writer.TryWrite(item)) pendingLoss = 0;
            else pendingLoss += packet.LossCount + 1;
        }
    }
    public void Complete() => Finish(null);
    public void Fail(Exception error) => Finish(error);
    private void Finish(Exception? error)
    {
        lock (channel)
        {
            if (closing) return;
            closing = true;
            if (pendingLoss == 0 || last is null) { channel.Writer.TryComplete(error); return; }
            var tail = last with { Bytes = [], OriginalLength = 0, LossCount = pendingLoss };
            _ = DrainTail(tail,error);
        }
    }
    private async Task DrainTail(PacketEnvelope packet,Exception? error)
    {
        await channel.Writer.WriteAsync(packet);
        channel.Writer.TryComplete(error);
    }
}
