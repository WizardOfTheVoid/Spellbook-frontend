using System.Text.Json;
using System.Text.Json.Nodes;

namespace SpellBook.Telemetry;

public class ItemContractsTests
{
    [Fact]
    public void PreservesCountedItemEvidenceAcrossTheWire()
    {
        const string json = """{"sequence":1,"elapsedUs":100,"ordinal":2,"kind":"itemObserved","entityId":null,"detail":"Observed item","count":100,"lastElapsedUs":900000,"groupKey":"item:0:sword","item":{"classPath":"/Game/Inventory/Sword","actorGuid":0,"ownerGuid":12,"playFabId":"D6A2C4BB2600FA9","attribution":"owner"}}""";
        var value = JsonSerializer.Deserialize<TelemetryEvent>(json, Wire.Json)!;
        var output = JsonNode.Parse(Wire.Serialize(value))!;
        Assert.Equal(100, output["count"]?.GetValue<long>());
        Assert.Equal("D6A2C4BB2600FA9", output["item"]?["playFabId"]?.GetValue<string>());
        Assert.Equal(900000, output["lastElapsedUs"]?.GetValue<long>());
    }

    [Fact]
    public void PreservesAnonymousTrackProvenance()
    {
        const string json = """{"entityId":"1:7:0","actorGuid":0,"channel":7,"kind":"pawn","active":true,"direction":"toServer","provisional":true}""";
        var value = JsonSerializer.Deserialize<TelemetryEntity>(json, Wire.Json)!;
        var output = JsonNode.Parse(Wire.Serialize(value))!;
        Assert.Equal("toServer", output["direction"]?.GetValue<string>());
        Assert.True(output["provisional"]?.GetValue<bool>());
        Assert.Null(output["playFabId"]);
    }
}
