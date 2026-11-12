namespace SpellBook.Telemetry;

public class ActorLifetimeRecoveryTests
{
    private static PacketEnvelope Packet(long ordinal) => new(ordinal, ordinal * 1000, DateTimeOffset.UnixEpoch, 101, 0, []);

    [Fact] public void ResolvingAnonymousActorPreservesEntityAndEarlierObservation()
    {
        var tracker = new TrackingOrchestrator();
        var before = tracker.Apply(new("position", 7, Location: new(1, 2, 3), Source: "fastSharedRpc73Prefix", Provisional: true), Packet(1)).Single().Entity!;
        tracker.Apply(new("actorResolved", 7, 100, Detail: "pawn", Provisional: true), Packet(2));
        var after = tracker.Apply(new("position", 7, 100, Location: new(2, 3, 4), Source: "fastSharedRpc73Prefix", Provisional: true), Packet(3)).Single().Entity!;
        Assert.Equal(before.EntityId, after.EntityId);
        Assert.Equal(100u, after.ActorGuid);
        Assert.Equal(0u, before.ActorGuid);
        Assert.True(after.Provisional);
    }

    [Fact] public void AnonymousDirectionsAndClosedLifetimesRemainSeparate()
    {
        var tracker = new TrackingOrchestrator();
        var incoming = tracker.Apply(new("position", 7, Location: new(1, 2, 3), Provisional: true), Packet(1)).Single().Entity!;
        var outgoing = tracker.Apply(new("position", 7, Location: new(1, 2, 3), Direction: "toServer", Provisional: true), Packet(2)).Single().Entity!;
        Assert.NotEqual(incoming.EntityId, outgoing.EntityId);
        tracker.Apply(new("actorClosed", 7), Packet(3));
        var reopened = tracker.Apply(new("position", 7, Location: new(4, 5, 6), Provisional: true), Packet(4)).Single().Entity!;
        Assert.NotEqual(incoming.EntityId, reopened.EntityId);
    }

    [Fact] public void ClosingPlayerStateImmediatelyClearsItsActivePawnProof()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 7, 100, Detail: "pawn"), Packet(1));
        tracker.Apply(new("properties", 7, 100, Fields: new() { ["playerStateGuid"] = 200u }), Packet(2));
        tracker.Apply(new("properties", 9, 200, Detail: "playerState", Fields: new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "ABCDEF1234567890") }), Packet(3));
        var position = tracker.Apply(new("position", 7, 100, Location: new(1, 2, 3)), Packet(4)).Single().Position!;
        Assert.NotNull(position.PlayFabId);
        var changes = tracker.Apply(new("actorClosed", 9, 200), Packet(5));
        Assert.Contains(changes, row => row.Entity?.ActorGuid == 100 && row.Entity.PlayFabId is null);
        Assert.NotNull(position.PlayFabId);
    }

    [Fact] public void ExplicitPeerGuidTransfersProofWithoutReplacingAnOutgoingAnonymousEntity()
    {
        var tracker = new TrackingOrchestrator();
        var anonymous = tracker.Apply(new("position", 7, Location: new(1, 2, 3), Direction: "toServer", Provisional: true), Packet(1)).Single().Entity!;
        tracker.Apply(new("actorResolved", 7, 100, Detail: "pawn", Provisional: true), Packet(2));
        tracker.Apply(new("properties", 7, 100, Fields: new() { ["playerStateGuid"] = 200u }, Provisional: true), Packet(3));
        tracker.Apply(new("properties", 9, 200, Detail: "playerState", Fields: new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "ABCDEF1234567890") }), Packet(4));
        var identified = tracker.Apply(new("position", 7, 100, Location: new(2, 3, 4), Direction: "toServer", Provisional: true), Packet(5)).Single().Entity!;
        Assert.Equal(anonymous.EntityId, identified.EntityId);
        Assert.Equal("ABCDEF1234567890", identified.PlayFabId);
        tracker.Apply(new("properties", 7, 100, Fields: new() { ["playerStateGuid"] = 0u }, Provisional: true), Packet(6));
        var cleared = tracker.Apply(new("position", 7, 100, Location: new(3, 4, 5), Direction: "toServer", Provisional: true), Packet(7)).Single().Position!;
        Assert.Null(cleared.PlayFabId);
        Assert.Null(anonymous.PlayFabId);
    }

    [Fact] public void ItemDestructionOnAReusedChannelEndsThePreviousPawnLifetime()
    {
        var tracker = new TrackingOrchestrator();
        var pawn = tracker.Apply(new("actorOpened", 12, 100, Detail: "pawn"), Packet(1)).Single().Entity!;
        tracker.Apply(new("actorOpened", 1, 200, Archetype: "/Game/Inventory/Weapons/Default__Sword", Detail: "item"), Packet(2));
        var closed = tracker.Apply(new("actorClosed", 12, 200, CloseReason: 0), Packet(3));
        Assert.Contains(closed, row => row.Entity?.EntityId == pawn.EntityId && !row.Entity.Active);
        Assert.Contains(closed, row => row.Event.Kind == "itemDestroyed");
    }
}
