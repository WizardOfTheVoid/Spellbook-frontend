namespace SpellBook.Telemetry;

public class ObjectTrackerTests
{
    private static readonly PacketEnvelope Packet = new(1, 100, DateTimeOffset.UnixEpoch, 1, 0, []);
    private static DecodedRecord Open(uint guid = 200, int channel = 1) => new("actorOpened", channel, guid, "NetGUID:55");
    private static IReadOnlyList<ItemEventDraft> Apply(ItemTracker tracker, DecodedRecord decoded) => tracker.Apply(decoded, Packet, _ => "ACCOUNT");

    [Fact] public void UnknownDynamicObjectsHaveDistinctLifecycleWithoutClaimingItemClassification()
    {
        var tracker = new ItemTracker();
        var observed = Assert.Single(Apply(tracker, Open() with { Location = new(1, 2, 3), SpawnLocationPresent = true }));
        Assert.Equal("objectObserved", observed.Kind);
        Assert.Equal("NetGUID:55", observed.Item!.ClassPath);
        Assert.Equal(new Vec3(1, 2, 3), observed.Item.Location);
        Assert.False(tracker.IsKnownItem(200));
        Assert.Empty(Apply(tracker, new("properties", 1, 200, Fields: new() { ["ownerGuid"] = 400u, ["instigatorGuid"] = 600u, ["replicatedMovement"] = new Vec3(4, 5, 6) })));
        Assert.Equal("objectDormant", Assert.Single(Apply(tracker, new("actorClosed", 1, 200, CloseReason: 1))).Kind);
        Assert.Equal("objectReappeared", Assert.Single(Apply(tracker, Open(channel: 9))).Kind);
        var destroyed = Assert.Single(Apply(tracker, new("actorClosed", 12, 200, CloseReason: 0)));
        Assert.Equal("objectDestroyed", destroyed.Kind);
        Assert.Null(destroyed.Item!.OwnerGuid);
        Assert.Null(destroyed.Item.PlayFabId);
    }

    [Fact] public void UnknownCandidatesExcludeStaticActorsMissingArchetypesAndKnownClasses()
    {
        var tracker = new ItemTracker();
        Assert.Empty(Apply(tracker, Open(201)));
        Assert.Empty(Apply(tracker, Open() with { Archetype = "NetGUID:0" }));
        Assert.Empty(Apply(tracker, Open() with { Archetype = "NetGUID:200" }));
        Assert.Empty(Apply(tracker, Open() with { Archetype = null }));
        Assert.Empty(Apply(tracker, Open() with { Archetype = "/Game/Characters/Classes/Subclasses/Officer.Default__Officer_C", Detail = "pawn" }));
        Assert.Empty(Apply(tracker, Open() with { Archetype = "/Game/Maps/Test.PersistentLevel.BreakableBarrel" }));
        Assert.Equal(0, tracker.RetainedCount);
    }

    [Fact] public void LaterKnownNonitemClassificationEndsCandidateWithoutDestruction()
    {
        var tracker = new ItemTracker();
        Assert.Equal("objectObserved", Assert.Single(Apply(tracker, Open())).Kind);
        Assert.Empty(Apply(tracker, new("actorResolved", 1, 200, "/Game/Characters/Classes/Subclasses/Officer.Default__Officer_C", Detail: "pawn")));
        Assert.Equal(0, tracker.RetainedCount);
        Assert.Empty(Apply(tracker, new("actorClosed", 1, 200, CloseReason: 0)));
    }

    [Fact] public void LaterItemClassificationPreservesObjectIdentityWithoutAnotherAppearance()
    {
        var tracker = new ItemTracker();
        Assert.Equal("objectObserved", Assert.Single(Apply(tracker, Open())).Kind);
        var classified = Assert.Single(Apply(tracker, new("actorResolved", 1, 200, "/Game/Inventory/Weapons/Weapon_Sword.Default__Weapon_Sword_C", Detail: "item")));
        Assert.Equal("itemClassified", classified.Kind);
        Assert.Equal(200u, classified.Item!.ActorGuid);
        Assert.True(tracker.IsKnownItem(200));
        Assert.Equal("itemDestroyed", Assert.Single(Apply(tracker, new("actorClosed", 1, 200, CloseReason: 0))).Kind);
    }
}
