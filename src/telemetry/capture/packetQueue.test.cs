namespace SpellBook.Telemetry;
public class PacketQueueTests
{
    [Fact] public async Task ReportsOverflowEvenWhenNoLaterPacketArrives()
    {
        var queue = new PacketQueue(1);
        queue.Accept(new(1,10,DateTimeOffset.UtcNow,1,1,[1]));
        queue.Accept(new(2,20,DateTimeOffset.UtcNow,1,1,[2]));
        queue.Complete();
        var packets = new List<PacketEnvelope>();
        await foreach (var packet in queue.Reader.ReadAllAsync(TestContext.Current.CancellationToken)) packets.Add(packet);
        Assert.Equal(2,packets.Count);
        Assert.Equal(1,packets[1].LossCount);
        Assert.Empty(packets[1].Bytes);
    }
    [Fact] public async Task ReportsOverflowBeforeNextAcceptedPacket()
    {
        var queue = new PacketQueue(1);
        var packet = new PacketEnvelope(0, 0, DateTimeOffset.UtcNow, 1, 1, [1]);
        queue.Accept(packet);
        queue.Accept(packet);
        Assert.Equal(0, (await queue.Reader.ReadAsync()).LossCount);
        queue.Accept(packet);
        Assert.Equal(1, (await queue.Reader.ReadAsync()).LossCount);
        queue.Complete();
    }
}
