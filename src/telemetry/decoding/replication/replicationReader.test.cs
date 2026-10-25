namespace SpellBook.Telemetry;
public class ReplicationReaderTests
{
    [Fact] public void UnsupportedTailDoesNotClaimCompletePropertyDecoding()
    {
        var r=new WireFixture().Bits(0,1).Packed(17).Packed(200).Packed(48).Reader();
        var result=ReplicationReader.Read(r,"pawn",new());
        Assert.False(result.Complete);
        Assert.Equal(200u,result.Fields["playerStateGuid"]);
        Assert.Contains("property 48",result.StopReason);
    }
    [Fact] public void TypedStateIdentityHandlesShortIdsAndRejectsUnframedText()
    {
        const string id="D6A2C4BB2600FA9";
        var block=new WireFixture().Packed(44).Identity(id).Packed(53).Reader();
        Assert.Equal(id,PlayerStateIdentity.ReadBoundedTail(block,0)!.Id);
        Assert.Null(PlayerStateIdentity.ReadBoundedTail(new WireFixture().Packed(43).Identity(id).Packed(53).Reader(),0));
        Assert.Null(PlayerStateIdentity.ReadBoundedTail(new WireFixture().Packed(44).Identity(id).Packed(20).Reader(),0));
    }
    [Fact] public void GuidOnlyCloseIsADestructionNotASpawn()
    {
        var spawn=SpawnReader.Read(new WireFixture().Packed(200).Reader(),new(),true);
        Assert.True(spawn.Destroyed);
        Assert.Equal(200u,spawn.ActorGuid);
    }
}
