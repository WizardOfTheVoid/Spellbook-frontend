namespace SpellBook.Telemetry;

public class ComponentPropertiesTests
{
    [Fact]
    public void StatsDecodeHalfFloatsAndSparseModifiers()
    {
        var wire = new WireFixture().Bits(0, 1).Packed(3).Bits(0x57d0, 16)
            .Packed(5).Bits(0x5640, 16).Packed(6).Bits(4, 16)
            .Packed(1).Bits(1, 1).Bits(1, 8).Packed(3).Bits(0, 1).Packed(0).Packed(0);
        var result = ReplicationReader.Read(wire.Reader(), "stats", new());
        Assert.True(result.Complete);
        Assert.Equal(125d, result.Fields["health"]);
        Assert.Equal(100d, result.Fields["stamina"]);
        var modifiers = Assert.IsType<SparseValues>(result.Fields["statuses"]);
        Assert.Equal(4, modifiers.Length);
        Assert.Equal(new[] { 0, 2 }, modifiers.Updates.Select(value => value.Index));
        Assert.Equal(0, modifiers.Updates[1].Value);
    }

    [Fact]
    public void InventoryRejectsDuplicateIndicesAndKeepsUnobservedSlotsUnknown()
    {
        var valid = new WireFixture().Bits(0, 1).Packed(10).Bits(3, 16).Packed(2).Packed(200).Packed(0).Packed(0);
        var parsed = ReplicationReader.Read(valid.Reader(), "inventory", new());
        Assert.True(parsed.Complete);
        var slots = Assert.IsType<SparseValues>(parsed.Fields["inventory"]);
        Assert.Single(slots.Updates);
        Assert.Equal(1, slots.Updates[0].Index);
        var duplicate = new WireFixture().Bits(0, 1).Packed(10).Bits(3, 16).Packed(2).Packed(200).Packed(2).Packed(0).Packed(0).Packed(0);
        Assert.False(ReplicationReader.Read(duplicate.Reader(), "inventory", new()).Complete);
    }

    [Fact]
    public void PlayerStateArraysNoLongerHideTypedIdentity()
    {
        var wire = new WireFixture().Bits(0, 1).Packed(27).Bits(2, 16).Packed(2).Bits(17, 32).Packed(0)
            .Packed(44).Identity("AAAA").Packed(87).Packed(300).Packed(0);
        var result = ReplicationReader.Read(wire.Reader(), "playerState", new());
        Assert.True(result.Complete);
        Assert.Equal("AAAA", Assert.IsType<UniqueNetId>(result.Fields["playFabIdentity"]).Id);
        Assert.Equal(300u, result.Fields["nextSpawnLoadout87"]);
    }
}
