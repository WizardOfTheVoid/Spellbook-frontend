namespace SpellBook.Telemetry;

public class StatsNotificationsTests
{
    [Fact]
    public void CapturedDamageKeepsDistinctReferencesAndDoesNotCreatePosition()
    {
        var data = Convert.FromHexString("0f0c463b000020090100e80b0d43a441e44ba44100c744a0871e6c2a9b39f03f40050004000400aca2f861691f040000f00f4085d8030000");
        var result = StatsNotifications.Read(7, new(data, 448))!.Value;
        Assert.Equal("damage", result.Kind);
        Assert.Equal(50f, result.Fields["amount"]);
        Assert.Equal(125f, result.Fields["resultingValue"]);
        Assert.Equal(1276u, result.Fields["damageTakerGuid"]);
        Assert.Equal(1076u, result.Fields["damageInstigatorGuid"]);
        Assert.Equal(1086u, result.Fields["inventoryItemGuid"]);
        Assert.Throws<InvalidDataException>(() => StatsNotifications.Read(7, new(data, 447)));
    }

    [Fact]
    public void DeathPreservesAllContributors()
    {
        var data = Convert.FromHexString("07005a385234ea447628ee39dece23a7be118102");
        var result = StatsNotifications.Read(9, new(data, 160))!.Value;
        Assert.Equal(new uint[] { 1814, 1684, 2234 }, Assert.IsType<uint[]>(result.Fields["killerGuids"]));
        Assert.Equal(0, result.Fields["reasonCode"]);
        Assert.Throws<InvalidDataException>(() => StatsNotifications.Read(9, new(data, 159)));
    }

    [Fact]
    public void HealIsAnAmountNotificationWithoutImmediateHealth()
    {
        var data = Convert.FromHexString("0100e085020000039d876000");
        var result = StatsNotifications.Read(8, new(data, 89))!.Value;
        Assert.Equal(120f, result.Fields["amount"]);
        Assert.Equal(6f, result.Fields["speed"]);
        Assert.Equal(1, result.Fields["healingSource"]);
        Assert.False(result.Fields.ContainsKey("health"));
    }

    [Fact]
    public void ComponentIdentityAndDirectionGateNotificationDecoding()
    {
        var output = new List<DecodedRecord>();
        var block = Convert.FromBase64String("Ev1MEAAAAPD///8P");
        ComponentDecoder.Read("fromServer", 6, 174, 224, "NetGUID:174.AbilitiesComponent", "pawn", false, new(block, 92), 20, new(), output, false);
        var ability = Assert.Single(output);
        Assert.Equal("abilityInitiated", ability.Kind);
        Assert.Equal(1, ability.Fields!["invocationId"]);
        Assert.Equal(20, ability.Evidence!.CompletionOrdinal);
        output.Clear();
        ComponentDecoder.Read("fromServer", 6, 174, 224, "NetGUID:174.Unverified", "pawn", false, new(block, 92), 20, new(), output, false);
        Assert.Empty(output);
    }
}
