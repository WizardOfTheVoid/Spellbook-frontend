namespace SpellBook.Telemetry;
public class ChannelTrackerTests
{
    private static Bunch Bunch(int sequence,bool initial=false,bool final=false,BitReader? data=null) => new(1,"Actor",false,false,true,sequence,false,false,initial||final,initial,final,data??new([1]));
    [Fact] public void ReordersReliableBunchesAndDropsDuplicates()
    {
        var channels=new ChannelTracker();
        Assert.Single(channels.Order("fromServer",Bunch(1)));
        Assert.Empty(channels.Order("fromServer",Bunch(3)));
        Assert.Equal(new[]{2,3},channels.Order("fromServer",Bunch(2)).Select(b=>b.Sequence));
        Assert.Empty(channels.Order("fromServer",Bunch(3)));
    }
    [Fact] public void PartialAssemblyPreservesBitBoundariesAndRejectsMissingStart()
    {
        var assembler=new PartialBunchAssembler();
        Assert.Null(assembler.Accept("fromServer",Bunch(1,true,data:new([5],3))));
        var result=assembler.Accept("fromServer",Bunch(2,final:true,data:new([3],2)))!;
        Assert.Equal(29ul,result.Data.Bits(5));
        Assert.Equal(0,assembler.Count);
        Assert.Throws<InvalidDataException>(()=>assembler.Accept("fromServer",Bunch(3,final:true)));
    }
    [Fact] public void BoundsTotalPartialMemoryAcrossChannels()
    {
        var assembler=new PartialBunchAssembler();
        for(var i=0;i<128;i++)assembler.Accept("fromServer",Bunch(1,true,data:new(new byte[65536])) with{Channel=i});
        Assert.Throws<InvalidDataException>(()=>assembler.Accept("fromServer",Bunch(1,true,data:new(new byte[65536])) with{Channel=128}));
    }
}
