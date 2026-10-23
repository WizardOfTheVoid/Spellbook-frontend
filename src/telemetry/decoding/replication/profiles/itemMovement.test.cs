namespace SpellBook.Telemetry;

public class ItemMovementTests
{
    [Fact] public void ItemMovementPreservesFollowingOwnershipAndUnknownClassTail()
    {
        var fixture = new WireFixture().Bits(0, 1).Packed(5).Bits(1, 2).Packed(6).Bits(0, 2);
        Vector(fixture, 7, 20, -100, 200, -50);
        fixture.Bits(1, 1).Bits(64, 8).Bits(1, 1).Bits(128, 8).Bits(0, 1);
        Vector(fixture, 2, 20, -3, 5, 0);
        fixture.Packed(13).Packed(400).Packed(14).Bits(3, 2).Packed(15).Packed(600);
        var knownPrefixBits = fixture.Reader().SizeBits;
        fixture.Packed(22).Bits(17, 8);
        var result = ReplicationReader.Read(fixture.Reader(), "item", new());
        Assert.Equal(new Vec3(-100, 200, -50), result.Fields["replicatedMovement"]);
        Assert.Equal(400u, result.Fields["ownerGuid"]);
        Assert.Equal(600u, result.Fields["instigatorGuid"]);
        Assert.False(result.Complete);
        Assert.Equal(knownPrefixBits, result.ConsumedBits);
        Assert.Contains("property 22", result.StopReason);
    }

    [Fact] public void UnsupportedItemMovementCannotProduceFollowingOwnership()
    {
        var reader = new WireFixture().Bits(0, 1).Packed(6).Bits(2, 2).Packed(13).Packed(400).Packed(0).Reader();
        var result = ReplicationReader.Read(reader, "item", new());
        Assert.False(result.Complete);
        Assert.Empty(result.Fields);
    }

    private static void Vector(WireFixture fixture, int bits, int maximum, int x, int y, int z)
    {
        var value = 0;
        for (var mask = 1; value + mask < maximum; mask <<= 1)
        {
            var bit = bits & mask;
            fixture.Bits(bit == 0 ? 0ul : 1ul, 1);
            value |= bit;
        }
        var bias = 1 << (bits + 1);
        foreach (var part in new[] { x, y, z }) fixture.Bits((ulong)(part + bias), bits + 2);
    }
}
