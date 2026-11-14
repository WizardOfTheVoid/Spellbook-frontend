namespace SpellBook.Telemetry;

public class InventoryClassTrackingTests
{
    private const string Messer = "/Game/Inventory/Weapons/MeleeWeapons/Weapon_Messer.Default__Weapon_Messer_C";
    private static PacketEnvelope Packet(long at) => new(at, at, DateTimeOffset.UnixEpoch.AddTicks(at * 10), 1, 0, []);
    private static DecodedRecord Item(uint guid = 400) => new("actorOpened", 3, guid, Messer, Detail: "item");
    private static DecodedRecord Inventory(uint guid) => new("properties", 1, 100, Fields: new()
    {
        ["inventory"] = new SparseValues(2, [new(1, guid)])
    }, Detail: "pawn");
    private static TrackingOrchestrator Tracker()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(0));
        return tracker;
    }

    [Fact]
    public void LaterClassObservationUpdatesHeldSlotWithoutRelabelingEarlierSnapshot()
    {
        var tracker = Tracker();
        var earlier = tracker.Apply(Inventory(400), Packet(1)).Single().Player!;
        var updates = tracker.Apply(Item(), Packet(2));
        var later = Assert.Single(updates, row => row.Player is not null).Player!;
        Assert.Null(earlier.Inventory![1].ClassPath);
        Assert.Equal(Messer, later.Inventory![1].ClassPath);
        Assert.Equal(earlier.TrackId, later.TrackId);
        Assert.Equal(2, later.ElapsedUs);
        Assert.Null(later.Inventory[0].ItemGuid);
    }

    [Fact]
    public void PreviouslyObservedClassResolvesWhenSlotArrives()
    {
        var tracker = Tracker();
        tracker.Apply(Item(), Packet(1));
        var assigned = tracker.Apply(Inventory(400), Packet(2)).Single().Player!;
        Assert.Equal(Messer, assigned.Inventory![1].ClassPath);
    }

    [Fact]
    public void DormancyPreservesLastKnownTypeButDestructionInvalidatesIt()
    {
        var tracker = Tracker();
        tracker.Apply(Item(), Packet(1));
        tracker.Apply(Inventory(400), Packet(2));
        tracker.Apply(new("actorClosed", 3, 400, CloseReason: 1), Packet(3));
        var dormant = tracker.Apply(Inventory(400), Packet(4)).Single().Player!;
        Assert.Equal(Messer, dormant.Inventory![1].ClassPath);
        var ended = tracker.Apply(new("actorClosed", 3, 400, CloseReason: 0), Packet(5));
        Assert.Null(Assert.Single(ended, row => row.Player is not null).Player!.Inventory![1].ClassPath);
        var stale = tracker.Apply(Inventory(400), Packet(6)).Single().Player!;
        Assert.Null(stale.Inventory![1].ClassPath);
    }

    [Fact]
    public void ReassignedOrClosedPlayerDoesNotReceiveLateItemType()
    {
        var tracker = Tracker();
        tracker.Apply(Inventory(400), Packet(1));
        var empty = tracker.Apply(Inventory(0), Packet(2)).Single().Player!;
        Assert.Equal(0u, empty.Inventory![1].ItemGuid);
        Assert.DoesNotContain(tracker.Apply(Item(), Packet(3)), row => row.Player is not null);
        tracker.Apply(Inventory(402), Packet(4));
        tracker.Apply(new("actorClosed", 1, 100), Packet(5));
        Assert.DoesNotContain(tracker.Apply(Item(402), Packet(6)), row => row.Player is not null);
    }

    [Fact]
    public void GapAndUnclassifiedObjectDoNotReuseAFormerClass()
    {
        var tracker = Tracker();
        tracker.Apply(Item(), Packet(1));
        tracker.Apply(new("captureGap", 0), Packet(2));
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(3));
        tracker.Apply(new("actorOpened", 3, 400, "NetGUID:999"), Packet(4));
        var assigned = tracker.Apply(Inventory(400), Packet(5)).Single().Player!;
        Assert.Null(assigned.Inventory![1].ClassPath);
    }

    [Fact]
    public void DestroyedGuidReopenedWithoutAClassDoesNotRestoreItsFormerLabel()
    {
        var tracker = Tracker();
        tracker.Apply(Item(), Packet(1));
        tracker.Apply(Inventory(400), Packet(2));
        tracker.Apply(new("actorClosed", 3, 400, CloseReason: 0), Packet(3));
        tracker.Apply(new("actorOpened", 3, 400, "NetGUID:999"), Packet(4));
        var assigned = tracker.Apply(Inventory(400), Packet(5)).Single().Player!;
        Assert.Null(assigned.Inventory![1].ClassPath);
    }

    [Fact]
    public void ReusedItemGuidRequiresAnExplicitInventoryAssignmentBeforeResolvingAgain()
    {
        const string nextPath = "/Game/Inventory/Weapons/MeleeWeapons/Weapon_Sword.Default__Weapon_Sword_C";
        var tracker = Tracker();
        tracker.Apply(Item(), Packet(1));
        var earlier = tracker.Apply(Inventory(400), Packet(2)).Single().Player!;
        tracker.Apply(new("actorClosed", 3, 400, CloseReason: 0), Packet(3));
        tracker.Apply(Inventory(400), Packet(4));
        var reopened = tracker.Apply(Item() with { Archetype = nextPath }, Packet(5));
        Assert.DoesNotContain(reopened, row => row.Player?.Inventory?.Any(slot => slot.ClassPath is not null) == true);
        var health = tracker.Apply(new("properties", 1, 100, Fields: new() { ["health"] = 90d }, Detail: "pawn"), Packet(6)).Single().Player!;
        Assert.Equal(400u, health.Inventory![1].ItemGuid);
        Assert.Null(health.Inventory[1].ClassPath);
        Assert.Equal(Messer, earlier.Inventory![1].ClassPath);
        var unchanged = tracker.Apply(Inventory(400) with { Fields = new() { ["inventory"] = new SparseValues(2, []) } }, Packet(7)).Single().Player!;
        Assert.Null(unchanged.Inventory![1].ClassPath);
        var reassigned = tracker.Apply(Inventory(400), Packet(8)).Single().Player!;
        Assert.Equal(nextPath, reassigned.Inventory![1].ClassPath);
    }

    [Fact]
    public void ReassigningOneSlotDoesNotResolveAnotherSlotRetainingTheOldGuid()
    {
        var tracker = Tracker();
        tracker.Apply(Item(), Packet(1));
        tracker.Apply(Inventory(400) with { Fields = new() { ["inventory"] = new SparseValues(2, [new(0, 400u), new(1, 400u)]) } }, Packet(2));
        tracker.Apply(new("actorClosed", 3, 400, CloseReason: 0), Packet(3));
        tracker.Apply(Item(), Packet(4));
        var assigned = tracker.Apply(Inventory(400), Packet(5)).Single().Player!;
        Assert.Null(assigned.Inventory![0].ClassPath);
        Assert.Equal(400u, assigned.Inventory[0].ItemGuid);
        Assert.Equal(Messer, assigned.Inventory[1].ClassPath);
    }

    [Fact]
    public void DestroyedItemGuidCanBeReusedAsAPawnWithoutKeepingItsOldItemRole()
    {
        var tracker = Tracker();
        tracker.Apply(Item(), Packet(1));
        tracker.Apply(Inventory(400), Packet(2));
        tracker.Apply(new("actorClosed", 3, 400, CloseReason: 0), Packet(3));
        var reopened = tracker.Apply(new("actorOpened", 3, 400, Detail: "pawn"), Packet(4));
        var pawn = Assert.Single(reopened, row => row.Player?.ActorGuid == 400).Player!;
        Assert.Equal("pawn", pawn.ObservationKind);
        Assert.DoesNotContain(reopened, row => row.Event.Item is not null);
    }
}
