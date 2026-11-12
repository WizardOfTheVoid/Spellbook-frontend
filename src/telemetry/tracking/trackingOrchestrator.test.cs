namespace SpellBook.Telemetry;
public class TrackingOrchestratorTests
{
    [Fact] public void DelayedIdentityDoesNotLeakIntoEarlierObservationsAndLossClearsIt()
    {
        var tracker = new TrackingOrchestrator();
        PacketEnvelope Packet(long at) => new(at, at, DateTimeOffset.UtcNow, 1, 0, []);
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0));
        tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }), Packet(1));
        var before = tracker.Apply(new("position", 1, 100, Location: new(1,2,3), Source: "serverMove32"), Packet(2)).Single().Position!;
        Assert.Null(before.PlayFabId);
        tracker.Apply(new("properties", 2, 200, Fields: new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "D6A2C4BB2600FA9") }), Packet(3));
        var after = tracker.Apply(new("position", 1, 100, Location: new(2,3,4), Source: "serverMove32"), Packet(4)).Single().Position!;
        Assert.Equal("D6A2C4BB2600FA9", after.PlayFabId);
        Assert.Null(before.PlayFabId);
        tracker.Apply(new("captureGap", 0), Packet(5));
        var reset = tracker.Apply(new("position", 1, 100, Location: new(2,3,4), Source: "serverMove32"), Packet(6)).Single().Position!;
        Assert.Null(reset.PlayFabId);
        Assert.NotEqual(after.EntityId, reset.EntityId);
    }
    [Fact] public void NonzeroBaseRetainsRawCoordinatesWithExplicitUncertainty()
    {
        var r = new BaseCoordinateResolver().Resolve(new(1,2,3), "serverMove32", 4069);
        Assert.Equal("unknown", r.Space);
        Assert.Equal(new Vec3(1,2,3), r.Location);
    }
    [Fact] public void ConflictingIdentityCannotRelabelAnExistingPawn()
    {
        var tracker = new TrackingOrchestrator();
        PacketEnvelope Packet(long at) => new(at,at,DateTimeOffset.UtcNow,1,0,[]);
        tracker.Apply(new("actorOpened",1,100,Detail:"pawn"),Packet(0));
        tracker.Apply(new("properties",1,100,Fields:new(){["playerStateGuid"]=200u}),Packet(1));
        tracker.Apply(new("properties",2,200,Fields:new(){["playFabIdentity"]=new UniqueNetId("PlayFab","AAAA")}),Packet(2));
        tracker.Apply(new("position",1,100,Location:new(1,2,3),Source:"serverMove32"),Packet(3));
        for (var at=4;at<=5;at++) tracker.Apply(new("properties",2,200,Fields:new(){["playFabIdentity"]=new UniqueNetId("PlayFab","BBBB")}),Packet(at));
        var point=tracker.Apply(new("position",1,100,Location:new(2,3,4),Source:"serverMove32"),Packet(6)).Single().Position!;
        Assert.Null(point.PlayFabId);
    }
}
