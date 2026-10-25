using System.Text.Json;
namespace SpellBook.Telemetry;

public class AccountObservationTests
{
    private static PacketEnvelope Packet(long at) => new(at, at, DateTimeOffset.UnixEpoch, 1, 0, []);
    private static ObservationSource Source(long at = 1) => new("fromServer", 2, 0, 0, "NetGUID:0", 0, 272, 272, at, "typedPlayerStateProfile", 44, "AQ==", "connection1");
    private static DecodedRecord State(uint actor, Dictionary<string, object?> fields) =>
        new("properties", 2, actor, Fields: fields, Detail: "playerState", Evidence: Source());
    private static PlayerStateSnapshot Account(IReadOnlyList<TrackedRecord> rows) =>
        Assert.Single(rows.Select(row => row.Player).OfType<PlayerStateSnapshot>(), player => Kind(player) == "account");
    private static string Kind(PlayerStateSnapshot player) => JsonDocument.Parse(Wire.Serialize(player)).RootElement.GetProperty("observationKind").GetString()!;

    [Fact]
    public void TypedAccountWithoutActorRetainsProfileWithoutCreatingPosition()
    {
        var tracker = new TrackingOrchestrator();
        var proof = State(0, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA"), ["playerName"] = "Observed", ["ping"] = 12u });
        var rows = tracker.Apply(proof, Packet(1));
        Assert.DoesNotContain(rows, row => row.Position is not null || row.Entity?.Kind == "pawn");
        var account = Account(rows);
        Assert.Equal("AAAA", account.PlayFabId);
        Assert.Equal("Observed", account.Name);
        Assert.Equal(0u, account.ActorGuid);
        Assert.Null(account.PlayerStateGuid);
        Assert.Null(account.Health);
        Assert.Same(proof.Evidence, account.Source);
        var update = Account(tracker.Apply(State(0, new() { ["ping"] = 18u, ["profileFloat95"] = 2f }), Packet(2)));
        Assert.Equal(account.TrackId, update.TrackId);
        Assert.Equal(account.LifetimeId, update.LifetimeId);
        Assert.Equal("AAAA", update.PlayFabId);
        Assert.Equal(18u, update.Profile!["ping"]);
        Assert.Equal(12u, account.Profile!["ping"]);
    }

    [Fact]
    public void AccountAndPawnMergeOnlyAfterObservedStateLinkAndClearStartsNewTrack()
    {
        var tracker = new TrackingOrchestrator();
        var account = Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(1)));
        var pawn = tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(2)).Single().Player!;
        Assert.NotEqual(account.TrackId, pawn.TrackId);
        Assert.Null(pawn.PlayFabId);
        var linked = tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(3))
            .Select(row => row.Player).OfType<PlayerStateSnapshot>().Single(player => player.EntityId == pawn.EntityId);
        Assert.Equal(account.TrackId, linked.TrackId);
        Assert.Contains(pawn.TrackId, linked.Aliases!);
        Assert.Equal("pawn", Kind(linked));
        Assert.Equal("AAAA", linked.PlayFabId);
        var cleared = tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 0u }, Detail: "pawn"), Packet(4)).Single().Player!;
        Assert.NotEqual(linked.TrackId, cleared.TrackId);
        Assert.Null(cleared.PlayFabId);
        Assert.Equal("AAAA", account.PlayFabId);
    }

    [Fact]
    public void ResolvingAnonymousStateUsesExistingExplicitPawnTrack()
    {
        var tracker = new TrackingOrchestrator();
        var account = Account(tracker.Apply(State(0, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA"), ["ping"] = 12u }), Packet(1)));
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(2));
        var pawn = tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(3)).Single().Player!;
        var resolved = Account(tracker.Apply(new("actorResolved", 2, 200, Detail: "playerState", Evidence: Source(4)), Packet(4)));
        Assert.Equal(account.LifetimeId, resolved.LifetimeId);
        Assert.Equal(pawn.TrackId, resolved.TrackId);
        Assert.Contains(account.TrackId, resolved.Aliases!);
        Assert.Equal(200u, resolved.PlayerStateGuid);
        Assert.Equal("AAAA", resolved.PlayFabId);
        var named = tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(5))
            .Select(row => row.Player).OfType<PlayerStateSnapshot>().Single(player => player.EntityId == pawn.EntityId);
        Assert.Equal(12u, named.Profile!["ping"]);
    }

    [Fact]
    public void ConflictingIdentityCannotRelabelAccountAndChannelReuseGetsFreshTrack()
    {
        var tracker = new TrackingOrchestrator();
        var first = Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA"), ["playerName"] = "First" }), Packet(1)));
        var conflict = Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "BBBB"), ["playerName"] = "Second" }), Packet(2)));
        Assert.Null(conflict.PlayFabId);
        Assert.Null(conflict.Name);
        var quarantined = Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(3)));
        Assert.Null(quarantined.PlayFabId);
        var closed = Account(tracker.Apply(new("actorClosed", 2, 200), Packet(4)));
        Assert.False(closed.Active);
        var next = Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "BBBB") }), Packet(5)));
        Assert.NotEqual(first.TrackId, next.TrackId);
        Assert.NotEqual(first.LifetimeId, next.LifetimeId);
        Assert.Equal("BBBB", next.PlayFabId);
        Assert.Null(next.Profile?.GetValueOrDefault("playerName"));
    }

    [Fact]
    public void CaptureGapClosesAccountAndDiscardsProfileContext()
    {
        var tracker = new TrackingOrchestrator();
        var first = Account(tracker.Apply(State(0, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(1)));
        var gap = tracker.Apply(new("captureGap", 0), Packet(2));
        Assert.False(Account(gap).Active);
        Assert.DoesNotContain(tracker.Apply(State(0, new() { ["ping"] = 1u }), Packet(3)), row => row.Player is not null);
        var next = Account(tracker.Apply(State(0, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(4)));
        Assert.NotEqual(first.TrackId, next.TrackId);
    }

    [Fact]
    public void UnassignedCoreStateRetainsEvidenceWithoutCreatingPlayer()
    {
        var tracker = new TrackingOrchestrator();
        var source = Source() with { ActorGuid = 100, ObjectGuid = 104, ClassPath = "NetGUID:100.StatsComponent" };
        var values = new Dictionary<string, object?> { ["health"] = 120f, ["statuses"] = new SparseValues(1, [new(0, 2)]) };
        var row = Assert.Single(tracker.Apply(new("properties", 4, 100, Fields: values, Detail: "unknown", Evidence: source), Packet(1)));
        Assert.Equal("componentStateObserved", row.Event.Kind);
        Assert.Null(row.Player);
        Assert.Null(row.Position);
        Assert.Null(row.Event.Player!.Actor);
        Assert.Null(row.Event.Player.Target);
        Assert.Same(source, row.Event.Player.Source);
        Assert.Same(values, row.Event.Player.Values);
        Assert.DoesNotContain(tracker.Apply(new("actorClosed", 4, 100), Packet(2)), value => value.Player is not null);
    }

    [Fact]
    public void LaterAccountProfileDoesNotEraseTotalsFromTheLinkedPawn()
    {
        var tracker = new TrackingOrchestrator();
        tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(1));
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(2));
        tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(3));
        tracker.Apply(new("damage", 1, 100, Fields: new() { ["damageTakerGuid"] = 100u, ["amount"] = 40f }, Detail: "pawn", Evidence: Source()), Packet(4));
        var account = Account(tracker.Apply(State(200, new() { ["ping"] = 10u }), Packet(5)));
        Assert.Equal(40d, account.DamageReceived);
        Assert.Null(account.Health);
        tracker.Apply(new("damage", 1, 100, Fields: new() { ["damageTakerGuid"] = 100u, ["amount"] = 10f }, Detail: "pawn", Evidence: Source()), Packet(6));
        var closed = Account(tracker.Apply(new("actorClosed", 2, 200), Packet(7)));
        Assert.Equal(50d, closed.DamageReceived);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void ConflictingChannelsInvalidateEveryCurrentAccountAndPawnUntilAllStateContextsClose(bool resolveAnonymous)
    {
        var tracker = new TrackingOrchestrator();
        var first = Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA"), ["playerName"] = "First" }), Packet(1)));
        tracker.Apply(new("actorOpened", 1, 100, Detail: "pawn"), Packet(2));
        var pawn = tracker.Apply(new("properties", 1, 100, Fields: new() { ["playerStateGuid"] = 200u }, Detail: "pawn"), Packet(3)).Single().Player!;
        var second = State(resolveAnonymous ? 0u : 200u, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "BBBB"), ["playerName"] = "Second" }) with { Channel = 3 };
        var conflict = tracker.Apply(second, Packet(4));
        if (resolveAnonymous) conflict = tracker.Apply(new("actorResolved", 3, 200, Detail: "playerState", Evidence: Source(5)), Packet(5));
        var updates = conflict.Select(row => row.Player).OfType<PlayerStateSnapshot>().ToArray();
        Assert.Contains(updates, row => row.EntityId == first.EntityId && row.PlayFabId is null && row.Name is null);
        Assert.Contains(updates, row => row.EntityId == pawn.EntityId && row.PlayFabId is null && row.Name is null);
        Assert.All(updates, row => Assert.Null(row.PlayFabId));
        var later = Account(tracker.Apply(State(200, new() { ["ping"] = 1u }), Packet(6)));
        Assert.Null(later.PlayFabId);
        Assert.Null(later.Profile?.GetValueOrDefault("playFabIdentity"));
        tracker.Apply(new("actorClosed", 3, 200), Packet(7));
        Assert.Null(Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(8))).PlayFabId);
        tracker.Apply(new("actorClosed", 2, 200), Packet(9));
        Assert.Equal("AAAA", Account(tracker.Apply(State(200, new() { ["playFabIdentity"] = new UniqueNetId("PlayFab", "AAAA") }), Packet(10))).PlayFabId);
    }
}
