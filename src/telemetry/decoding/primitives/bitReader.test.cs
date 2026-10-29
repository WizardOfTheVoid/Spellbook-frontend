namespace SpellBook.Telemetry;
public class BitReaderTests
{
    [Fact] public void PackedBoundsAndUnalignedFork()
    {
        var reader = new BitReader([3, 2]);
        Assert.Equal(129u, reader.Packed());
        Assert.Equal(0, reader.Remaining);
        var bits = new BitReader([0b_11101010]);
        Assert.Equal(2ul, bits.Bits(3));
        Assert.Equal(29ul, bits.Fork(5).Bits(5));
        Assert.Throws<InvalidDataException>(() => bits.Bits(1));
        Assert.Throws<InvalidDataException>(() => new BitReader([255,255,255,255,255]).Packed());
    }
}
