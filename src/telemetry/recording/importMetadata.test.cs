namespace SpellBook.Telemetry;

public class ImportMetadataTests
{
    [Theory]
    [InlineData("{}")]
    [InlineData("{\"endpoint\":{\"host\":\"invalid\",\"port\":7777}}")]
    [InlineData("{\"serverIp\":\"5.101.165.14\",\"gamePort\":10120,\"captureStartUtc\":\"broken\"}")]
    [InlineData("{\"endpoint\":{\"host\":\"5.101.165.14\",\"port\":10120},\"head\":{\"elapsedUs\":-1}}")]
    public void InvalidMetadataNeverFallsBackToAnotherServer(string json)
    {
        var root = TestWorkspace.Create();
        try
        {
            var path = Path.Combine(root, "manifest.json");
            File.WriteAllText(path, json);
            Assert.Throws<ArgumentException>(() => ImportMetadata.Read(new([], path, new("127.0.0.1", 7777))));
        }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void StandalonePacketRequiresAnExplicitEndpoint()
    {
        Assert.Throws<ArgumentException>(() => ImportMetadata.Read(new([])));
        var endpoint = new Endpoint("5.101.165.14", 10120);
        Assert.Equal(new ImportMetadata(endpoint, null), ImportMetadata.Read(new([], Endpoint: endpoint)));
    }
}
