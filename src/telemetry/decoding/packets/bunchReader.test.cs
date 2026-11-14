namespace SpellBook.Telemetry;

public class BunchReaderTests
{
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(3)]
    [InlineData(4)]
    [InlineData(12)]
    public void RetainsCloseReasonWithoutChangingFollowingFraming(int reason)
    {
        var reader = new WireFixture().Bits(1, 1).Bits(0, 1).Bits(1, 1).Bits((ulong)reason, 4)
            .Bits(0, 2).Packed(5).Bits(0, 3).Bits(0, 13).Reader();
        var bunch = BunchReader.Read(reader, 7);
        Assert.True(bunch.Close);
        Assert.Equal(reason, bunch.CloseReason);
        Assert.Equal(5, bunch.Channel);
        Assert.Equal(0, reader.Remaining);
    }

    [Fact] public void FinalPartialCarriesDestructionReason()
    {
        var assembler = new PartialBunchAssembler();
        var first = new Bunch(1, "Actor", true, false, true, 1, false, false, true, true, false, new([5], 3));
        var last = first with { Open = false, Close = true, CloseReason = 0, Sequence = 2, Initial = false, Final = true, Data = new([3], 2) };
        Assert.Null(assembler.Accept("fromServer", first));
        var result = assembler.Accept("fromServer", last)!;
        Assert.True(result.Close);
        Assert.Equal(0, result.CloseReason);
        Assert.Equal(29ul, result.Data.Bits(5));
    }
}
