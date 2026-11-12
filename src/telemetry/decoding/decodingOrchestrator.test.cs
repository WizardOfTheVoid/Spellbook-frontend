namespace SpellBook.Telemetry;
public class DecodingOrchestratorTests
{
    [Fact] public void RejectsTruncatedTrafficWithoutGuessingIdentity()
    {
        var decoder = new DecodingOrchestrator(new("127.0.0.1", 7777));
        Assert.Empty(decoder.Accept(new(0, 0, DateTimeOffset.UtcNow, 1, 1, [1])));
        Assert.Empty(decoder.Complete());
    }
    [Fact] public void UnknownMetadataNeverBecomesIdentity()
    {
        var cache = new NetGuidCache();
        Assert.Equal("NetGUID:12", cache.Path(12));
        Assert.Throws<InvalidDataException>(() => UniqueNetIds.Read(new BitReader([248, 255, 255, 255, 127])));
    }
}
