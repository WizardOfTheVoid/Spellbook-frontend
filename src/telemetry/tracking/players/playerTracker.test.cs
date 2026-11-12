namespace SpellBook.Telemetry;

public class PlayerTrackerTests
{
    private static PacketEnvelope Packet(long at) => new(at, at, DateTimeOffset.UnixEpoch, 1, 0, []);
    private static ObservationSource Source(long at = 1) => new("fromServer", 1, 100, 104, "NetGUID:100.StatsComponent", 0, 100, 100, at, "observedProfile");

    [Fact]
    public void AnonymousTrackUpgradesAndPlayerStateClearIsCausal()
    {
        var tracker = new TrackingOrchestrator();
        var anonymous = tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0)).Single().Player!;
        tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(1));
        var named = tracker.Apply(new("properties", 2, 200, Fields: new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }, Detail: "playerState"), Packet(2))
            .Select(row => row.Player).Single(row => row?.EntityId == anonymous.EntityId)!;
        Assert.Equal(anonymous.TrackId, named.TrackId);
        Assert.Equal("AAAA", named.PlayFabId);
        var cleared = tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 0u }, Detail: "pawn"), Packet(3)).Single().Player!;
        Assert.Null(cleared.PlayFabId);
        Assert.NotEqual(named.TrackId, cleared.TrackId);
        var position = tracker.Apply(new("position", 1, 100, Location: new(1, 2, 3)), Packet(3)).Single().Position!;
        Assert.Null(position.PlayFabId);
        Assert.Null(anonymous.PlayFabId);
    }

    [Fact]
    public void LinkedPawnLifetimesShareTrackButHealthAndInventoryDoNotCarryAcrossSpawn()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0));
        var linked = tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(1)).Single().Player!;
        var state = tracker.Apply(new("properties", 1, 100, Fields: new()
        {
            ["health"] = 125d, ["inventory"] = new SparseValues(3, [new(1, 400u)])
        }, Detail: "pawn", Evidence: Source()), Packet(2)).Single().Player!;
        Assert.Null(state.Inventory![0].ItemGuid);
        Assert.Null(state.MaxHealth);
        Assert.Equal(400u, state.Inventory[1].ItemGuid);
        tracker.Apply(new("actorClosed", 1, 100), Packet(3));
        tracker.Apply(new("actorOpened", 1, 102, Detail: "pawn"), Packet(4));
        var next = tracker.Apply(new("properties", 1, 102, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(5)).Single().Player!;
        Assert.Equal(linked.TrackId, next.TrackId);
        Assert.NotEqual(linked.LifetimeId, next.LifetimeId);
        Assert.Null(next.Health);
        Assert.Null(next.Inventory);
        Assert.Null(next.Deaths);
    }

    [Fact]
    public void HealingAndChannelClosureDoNotInventDeathOrHealthChanges()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0));
        tracker.Apply(new("properties", 1, 100, Fields: new() { ["health"] = 50d }, Detail: "pawn", Evidence: Source()), Packet(1));
        var heal = tracker.Apply(new("healing", 1, 100, Fields: new() { ["amount"] = 120f }, Detail: "pawn", Evidence: Source()), Packet(2)).Single();
        Assert.Equal("healing", heal.Event.Kind);
        var closed = tracker.Apply(new("actorClosed", 1, 100), Packet(3)).Single();
        Assert.Equal(50d, closed.Player!.Health);
        Assert.Null(closed.Player.Deaths);
        Assert.False(closed.Player.Active);
    }

    [Fact]
    public void MultipleDeathContributorsRemainAnArrayWithoutSoleKillCredit()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0));
        tracker.Apply(new("actorOpened", 2, 200, Detail: "pawn"), Packet(0));
        var death = tracker.Apply(new("death", 1, 100, Fields: new()
        {
            ["killerGuids"] = new uint[] { 200, 300, 400 }, ["reasonCode"] = 0
        }, Detail: "pawn", Evidence: Source()), Packet(1)).Single();
        Assert.Equal(3, death.Event.Player!.Contributors!.Count);
        Assert.NotNull(death.Event.Player.Contributors[0].TrackId);
        Assert.Null(death.Event.Player.Contributors[1].TrackId);
        Assert.Equal(1, death.Player!.Deaths);
    }

    [Fact]
    public void ObservedDamageTotalsContinueAcrossLinkedLifetimes()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0));
        tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(1));
        tracker.Apply(new("damage", 1, 100, Fields: new()
        {
            ["damageTakerGuid"] = 100u, ["damageInstigatorGuid"] = 300u, ["amount"] = 40f, ["resultingValue"] = -10f
        }, Detail: "pawn", Evidence: Source()), Packet(2));
        tracker.Apply(new("actorClosed", 1, 100), Packet(3));
        tracker.Apply(new("actorOpened", 1, 102, Detail: "pawn"), Packet(4));
        var respawned = tracker.Apply(new("properties", 1, 102, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(5)).Single().Player!;
        Assert.Equal(40d, respawned.DamageReceived);
        Assert.Null(respawned.Health);
        Assert.Null(respawned.Deaths);
    }

    [Fact]
    public void ItemRelationshipsUseOnlyIdentityKnownAtTheEvent()
    {
        const string path = "/Game/Inventory/Weapons/Weapon_Sword.Default__Weapon_Sword_C";
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0));
        tracker.Apply(new("actorOpened", 3, 300, path, Detail: "item"), Packet(1));
        var related = tracker.Apply(new("properties", 3, 300, Fields: new() { ["ownerGuid"] = 100u }), Packet(2)).Single();
        var anonymous = related.Event.Player!.Actor!;
        Assert.NotNull(anonymous.TrackId);
        Assert.Null(anonymous.PlayFabId);
        tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(3));
        tracker.Apply(new("properties", 2, 200, Fields: new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }, Detail: "playerState"), Packet(4));
        Assert.Null(related.Event.Player.Actor!.PlayFabId);
        tracker.Apply(new("actorClosed", 1, 100), Packet(5));
        var unresolved = tracker.Apply(new("properties", 3, 300, Fields: new() { ["instigatorGuid"] = 100u }), Packet(6)).Single();
        Assert.Null(unresolved.Event.Player);
    }

    [Fact]
    public void IncomingAndOutgoingTracksMergeOnlyAfterObservedActorReference()
    {
        var tracker = new TrackingOrchestrator();
        var outgoing = tracker.Apply(new("position", 1, Location: new(1, 2, 3), Direction: "toServer", Provisional: true), Packet(0)).Single().Player!;
        var incoming = tracker.Apply(new("actorResolved", 1, 100, Detail: "pawn"), Packet(1)).Single().Player!;
        Assert.NotEqual(outgoing.TrackId, incoming.TrackId);
        var resolved = tracker.Apply(new("position", 1, 100, Location: new(2, 3, 4), Direction: "toServer"), Packet(2)).Single().Player!;
        Assert.Equal(incoming.TrackId, resolved.TrackId);
        Assert.Contains(outgoing.TrackId, resolved.Aliases!);
        Assert.Null(resolved.PlayFabId);
    }

    [Fact]
    public void ClosingAnonymousPlayerStateClearsTrackLinkBeforeGuidReuse()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 2, 200, Detail: "playerState"), Packet(0));
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(1));
        var linked = tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(2)).Single().Player!;
        var cleared = tracker.Apply(new("actorClosed", 2, 200), Packet(3)).Single(row => row.Player is not null).Player!;
        Assert.Null(cleared.PlayerStateGuid);
        Assert.NotEqual(linked.TrackId, cleared.TrackId);
        tracker.Apply(new("actorOpened", 2, 200, Detail: "playerState"), Packet(4));
        tracker.Apply(new("properties", 2, 200, Fields: new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "BBBB") }, Detail: "playerState"), Packet(5));
        var position = tracker.Apply(new("position", 1, 100, Location: new(1, 2, 3)), Packet(6)).Single().Position!;
        Assert.Null(position.PlayFabId);
    }
}
