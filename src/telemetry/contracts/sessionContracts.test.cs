namespace SpellBook.Telemetry;
public class SessionContractsTests
{
    [Fact] public void PreservesShortPlayFabId()
    {
        Assert.True(Wire.IsPlayFabId("D6A2C4BB2600FA9"));
        Assert.False(Wire.IsPlayFabId("not-an-id"));
        Assert.Contains("D6A2C4BB2600FA9", Wire.Serialize(new NameObservation("D6A2C4BB2600FA9", "Player", "spellbookProduction", DateTimeOffset.UtcNow)));
    }
    [Fact] public void RequiresLiteralIpv4Endpoint()
    {
        Assert.True(new Endpoint("127.0.0.1", 7777).IsValid);
        Assert.False(new Endpoint("example.com/path", 7777).IsValid);
        Assert.False(new Endpoint("127.0.0.1", 65536).IsValid);
    }
    [Fact] public void SharesTheUpdateFixtureWithTypeScript()
    {
        var json=File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"fixtures","update.json"));
        var update=System.Text.Json.JsonSerializer.Deserialize<TelemetryUpdate>(json,Wire.Json)!;
        Assert.Equal(7,update.Cursor.UpdateSequence);
        Assert.Equal(5,update.CommittedHead.Sequence);
        Assert.Equal(3,update.Revision);
        Assert.Equal(System.Text.Json.Nodes.JsonNode.Parse(json)!.ToJsonString(),System.Text.Json.Nodes.JsonNode.Parse(Wire.Serialize(update))!.ToJsonString());
    }
}
