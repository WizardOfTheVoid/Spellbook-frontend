namespace SpellBook.Telemetry;

public class ItemTrackerTests
{
    private const string ItemPath = "/Game/Inventory/Weapons/Weapon_Sword.Default__Weapon_Sword_C";
    private static readonly PacketEnvelope Packet = new(1, 100, DateTimeOffset.UnixEpoch, 1, 0, []);
    private static DecodedRecord Open(uint guid, int channel = 1) => new("actorOpened", channel, guid, ItemPath, Detail: "item");
    private static IReadOnlyList<ItemEventDraft> Apply(ItemTracker tracker, DecodedRecord decoded) => tracker.Apply(decoded, Packet, guid => guid == 400 ? "ACCOUNT" : null);

    [Fact] public void CountsDistinctActorsEvenWhenOneHundredShareAClass()
    {
        var tracker = new ItemTracker();
        var events = Enumerable.Range(1, 100).SelectMany(index => Apply(tracker, Open((uint)index * 2, index))).ToArray();
        Assert.Equal(100, events.Count(row => row.Kind == "itemObserved"));
        Assert.Equal(100, events.Select(row => row.Item!.ActorGuid).Distinct().Count());
        Assert.All(events, row => Assert.Null(row.Item!.PlayFabId));
        Assert.Empty(Apply(tracker, Open(2, 1)));
    }

    [Fact] public void SeparatesReappearanceDormancyAndGuidOnlyDestruction()
    {
        var tracker = new ItemTracker();
        Apply(tracker, Open(200));
        var dormant = Assert.Single(Apply(tracker, new("actorClosed", 1, 200, CloseReason: 1)));
        Assert.Equal("itemDormant", dormant.Kind);
        Assert.Equal(1, dormant.Item!.CloseReason);
        var reopened = Assert.Single(Apply(tracker, Open(200, 9)));
        Assert.Equal("itemReappeared", reopened.Kind);
        var destroyed = Assert.Single(Apply(tracker, new("actorClosed", 12, 200, CloseReason: 0)));
        Assert.Equal("itemDestroyed", destroyed.Kind);
        Assert.Equal(ItemPath, destroyed.Item!.ClassPath);
        Assert.Empty(Apply(tracker, new("actorClosed", 12, 200, CloseReason: 0)));
    }

    [Fact] public void RetainsRawCloseReasonsWithoutTreatingEveryClosureAsDestruction()
    {
        var tracker = new ItemTracker();
        Apply(tracker, Open(200));
        var irrelevant = Assert.Single(Apply(tracker, new("actorClosed", 1, 200, CloseReason: 3)));
        Assert.Equal("itemNoLongerRelevant", irrelevant.Kind);
        Assert.Equal(3, irrelevant.Item!.CloseReason);
        Apply(tracker, Open(200));
        var unknown = Assert.Single(Apply(tracker, new("actorClosed", 1, 200, CloseReason: 12)));
        Assert.Equal("itemChannelClosed", unknown.Kind);
        Assert.Equal(12, unknown.Item!.CloseReason);
    }

    [Fact] public void TracksCurrentOwnerAndInstigatorIncludingExplicitClears()
    {
        var tracker = new ItemTracker();
        Apply(tracker, Open(200));
        var fields = new Dictionary<string, object?> { ["ownerGuid"] = 400u, ["instigatorGuid"] = 600u };
        var events = Apply(tracker, new("properties", 1, 200, Fields: fields));
        var owner = Assert.Single(events, row => row.Kind == "itemOwnerChanged");
        Assert.Equal("ACCOUNT", owner.Item!.PlayFabId);
        Assert.Equal("owner", owner.Item.Attribution);
        Assert.Equal(400u, owner.Item.OwnerGuid);
        var instigator = Assert.Single(events, row => row.Kind == "itemInstigatorChanged");
        Assert.Null(instigator.Item!.PlayFabId);
        Assert.Equal("instigator", instigator.Item.Attribution);
        Assert.Equal(600u, instigator.Item.InstigatorGuid);
        Assert.Empty(Apply(tracker, new("properties", 1, 200, Fields: fields)));
        var cleared = Assert.Single(Apply(tracker, new("properties", 1, 200, Fields: new() { ["ownerGuid"] = 0u })));
        Assert.Equal(0u, cleared.Item!.OwnerGuid);
        Assert.Null(cleared.Item.PlayFabId);
    }

    [Fact] public void DestroyedGuidReopenedAsNamedItemStartsWithoutFormerRelationships()
    {
        var tracker = new ItemTracker();
        Apply(tracker, Open(200));
        Apply(tracker, new("properties", 1, 200, Fields: new() { ["ownerGuid"] = 400u, ["instigatorGuid"] = 600u }));
        Apply(tracker, new("actorClosed", 1, 200, CloseReason: 0));
        const string nextPath = "/Game/Inventory/Weapons/Weapon_Axe.Default__Weapon_Axe_C";
        var reopened = Assert.Single(Apply(tracker, Open(200, 9) with { Archetype = nextPath }));
        Assert.Equal("itemObserved", reopened.Kind);
        Assert.Equal(nextPath, reopened.Item!.ClassPath);
        Assert.Null(reopened.Item.OwnerGuid);
        Assert.Null(reopened.Item.InstigatorGuid);
        Assert.Null(reopened.Item.PlayFabId);
        var current = Assert.Single(Apply(tracker, new("properties", 9, 200, Fields: new() { ["ownerGuid"] = 600u })));
        Assert.Equal(600u, current.Item!.OwnerGuid);
        Assert.Null(current.Item.InstigatorGuid);
    }

    [Fact] public void BoundsRetainedIdentitiesAndMarksLostDeduplicationCoverage()
    {
        var tracker = new ItemTracker(2);
        Apply(tracker, Open(200));
        Apply(tracker, Open(202));
        var overflow = Apply(tracker, Open(204));
        Assert.Equal(2, tracker.RetainedCount);
        Assert.False(tracker.IsKnownItem(200));
        Assert.Contains(overflow, row => row.Kind == "itemCoverageReset");
        var observed = Assert.Single(Apply(tracker, Open(200)), row => row.Kind == "itemObserved");
        Assert.Equal("firstObservedAfterEviction", observed.Item!.Attribution);
    }

    [Fact] public void ReportsEvictionOncePerContinuityAcrossTenThousandNewObjects()
    {
        var tracker = new ItemTracker(2);
        var notices = 0;
        for (uint guid = 2; guid <= 20004; guid += 2)
            notices += Apply(tracker, Open(guid)).Count(row => row.Kind == "itemCoverageReset");
        Assert.Equal(1, notices);
        Assert.Equal(2, tracker.RetainedCount);
        Apply(tracker, new("captureGap", 0));
        var renewed = Enumerable.Range(1, 3).SelectMany(index => Apply(tracker, Open((uint)index * 2))).ToArray();
        Assert.Equal(1, renewed.Count(row => row.Kind == "itemCoverageReset"));
    }

    [Fact] public void RejectsStaleRelationshipsAndClosesWhilePreservingKnownMetadataOnReopen()
    {
        var tracker = new ItemTracker();
        Apply(tracker, Open(200));
        Apply(tracker, new("properties", 1, 200, Fields: new() { ["ownerGuid"] = 400u }));
        Apply(tracker, new("actorClosed", 1, 200, CloseReason: 1));
        Assert.Empty(Apply(tracker, new("properties", 1, 200, Fields: new() { ["ownerGuid"] = 600u })));
        var reopened = Assert.Single(Apply(tracker, Open(200, 9)));
        Assert.Equal(400u, reopened.Item!.OwnerGuid);
        Assert.Null(reopened.Item.PlayFabId);
        Assert.Empty(Apply(tracker, new("properties", 1, 200, Fields: new() { ["ownerGuid"] = 600u })));
        Assert.Empty(Apply(tracker, new("actorClosed", 1, 200, CloseReason: 3)));
        var current = Assert.Single(Apply(tracker, new("properties", 9, 200, Fields: new() { ["ownerGuid"] = 0u })));
        Assert.Equal(0u, current.Item!.OwnerGuid);
        Assert.Equal("itemDestroyed", Assert.Single(Apply(tracker, new("actorClosed", 12, 200, CloseReason: 0))).Kind);
    }

    [Fact] public void CaptureGapRestartsItemContinuityAndIgnoresNonItems()
    {
        var tracker = new ItemTracker();
        Assert.Empty(Apply(tracker, new("actorOpened", 1, 200, "/Game/Characters/Classes/Subclasses/Officer.Default__Officer_C")));
        Assert.Empty(Apply(tracker, new("actorClosed", 2, 300, CloseReason: 0)));
        Apply(tracker, Open(200));
        Apply(tracker, new("captureGap", 0));
        Assert.Equal(0, tracker.RetainedCount);
        Assert.Equal("itemObserved", Assert.Single(Apply(tracker, Open(200))).Kind);
    }

    [Fact] public void StaticItemPathsAndExplicitSpawnPresenceRemainObservable()
    {
        var tracker = new ItemTracker();
        var staticPath = "/Game/Maps/Tutorial/Duelyard_Art.Duelyard_Art.PersistentLevel.Weapon_Messer3_2";
        var placed = Assert.Single(Apply(tracker, new("actorOpened", 1, 201, staticPath)));
        Assert.Equal(staticPath, placed.Item!.ClassPath);
        Assert.Null(placed.Item.Location);
        Assert.Null(placed.Item.SpawnLocationPresent);
        var zero = Assert.Single(Apply(tracker, Open(200) with { Location = new(), SpawnLocationPresent = true }));
        Assert.Equal(new Vec3(), zero.Item!.Location);
        Assert.True(zero.Item.SpawnLocationPresent);
        var omitted = Assert.Single(Apply(tracker, Open(204) with { Location = new(), SpawnLocationPresent = false }));
        Assert.Null(omitted.Item!.Location);
        Assert.False(omitted.Item.SpawnLocationPresent);
        Assert.Empty(Apply(tracker, Open(202) with { Direction = "toServer" }));
    }
}
