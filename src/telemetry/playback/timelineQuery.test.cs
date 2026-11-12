using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public class TimelineQueryTests(ITestOutputHelper output)
{
    private sealed class Recording : IDisposable
    {
        public string Root { get; } = TestWorkspace.Create();
        public RecordingStatus Status { get; } = new(Guid.NewGuid().ToString(), new("127.0.0.1", 7777)) { StartedAtUtc = DateTimeOffset.UtcNow, State = "recording" };
        public RecordingOrchestrator Writer { get; }
        private long ordinal;
        public Recording() => Writer = new(Root, Status, new(Root, "unused", Guid.NewGuid().ToString(), Environment.ProcessId, "test") { FreeSpaceFloor = 0 });
        public async Task Append(params TelemetryEvent[] events)
        {
            var time = events.Max(row => row.ElapsedUs);
            await Writer.Append(new(ordinal++, time, DateTimeOffset.UtcNow, 1, 1, [1]), events.Select(row => new TrackedRecord(row)).ToArray());
            await Writer.Flush(time);
        }
        public EventPage Query(long toUs = 10_000_000, long fromUs = 0, long after = 0, int limit = 200, string? entity = null, string[]? kinds = null, bool grouped = true, bool newest = false, CancellationToken? ct = null)
            => TimelineQuery.Events(Root, new(Status.Id, fromUs, toUs, after, limit, entity, kinds, grouped, newest), ct ?? TestContext.Current.CancellationToken);
        public void Dispose() { Writer.Dispose(); SqliteConnection.ClearAllPools(); Directory.Delete(Root, true); }
    }
    private static TelemetryEvent Item(long time, uint actor, string itemClass = "Sword", string kind = "itemObserved", uint owner = 10, string? account = null, string attribution = "owner")
        => new(0, time, 0, kind, $"item:{actor}", "item activity", new(itemClass, actor, owner, PlayFabId: account, Attribution: attribution, Location: new(actor, 0, 0), SpawnLocationPresent: true));

    [Theory] [InlineData(false)] [InlineData(true)]
    public async Task KindPagesMergeInOrderWithoutDuplicatingRepeatedFilters(bool newest)
    {
        using var recording=new Recording();
        await recording.Append(Enumerable.Range(1,8).Select(index=>Item(index*100_000,(uint)index,$"Class{index}",index%3==0?"other":index%3==1?"itemObserved":"itemClosed")).ToArray());
        var page=TimelineQuery.Events(recording.Root,new(recording.Status.Id,0,800_000,Limit:2,Kinds:["itemObserved","itemClosed","itemObserved"],NewestFirst:newest,Offset:2),TestContext.Current.CancellationToken);
        Assert.Equal(newest?new long[]{5,4}:new long[]{4,5},page.Events.Select(row=>row.Sequence));
        Assert.Equal(6,page.MatchingGroups);
        Assert.Equal(4,page.NextOffset);
    }

    [Fact] public async Task GroupsDistinctItemsWithoutLosingRawActivitiesOrInventingOneRepresentativeObject()
    {
        using var recording = new Recording();
        await recording.Append(Enumerable.Range(1, 100).Select(i => Item(100_000 + i * 1000, (uint)i)).ToArray());
        var group = Assert.Single(recording.Query().Events);
        Assert.Equal(100, group.Count);
        Assert.Equal(1, group.Sequence);
        Assert.Equal(200_000, group.LastElapsedUs);
        Assert.NotEmpty(group.GroupKey!);
        Assert.Null(group.EntityId);
        Assert.Equal(0u, group.Item!.ActorGuid);
        Assert.Null(group.Item.Location);
        Assert.Null(group.Item.SpawnLocationPresent);
        Assert.NotEqual("item activity", group.Detail);
        Assert.Equal(100, recording.Query(grouped: false).Events.Count);
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public async Task GrowingGroupsKeepTheirIdentityAndDoNotReappearOnTheNextPage(bool newest)
    {
        using var recording = new Recording();
        await recording.Append(Item(100_000, 1), Item(200_000, 2, "Shield"));
        var page = recording.Query(limit: 1, newest: newest);
        var first = Assert.Single(page.Events);
        Assert.NotNull(page.NextSequence);
        await recording.Append(Item(300_000, 3, first.Item!.ClassPath));
        var refreshed = recording.Query(limit: 1, newest: newest);
        var updated = Assert.Single(refreshed.Events);
        Assert.Equal(first.GroupKey, updated.GroupKey);
        Assert.Equal(first.Sequence, updated.Sequence);
        Assert.Equal(2, updated.Count);
        var next = recording.Query(after: page.NextSequence!.Value, limit: 1, newest: newest);
        var other = Assert.Single(next.Events);
        Assert.NotEqual(updated.GroupKey, other.GroupKey);
        Assert.Equal(1, other.Count);
        Assert.Null(next.NextSequence);
    }

    [Fact] public async Task AppliesTimeEntityAndKindFiltersBeforeComputingCounts()
    {
        using var recording = new Recording();
        await recording.Append(Item(100_000, 1), Item(200_000, 2), Item(300_000, 1), Item(400_000, 2, kind: "itemClosed"));
        var early = Assert.Single(recording.Query(toUs: 250_000).Events);
        Assert.Equal(2, early.Count);
        Assert.Equal(200_000, early.LastElapsedUs);
        var partial = Assert.Single(recording.Query(fromUs: 150_000, toUs: 350_000, entity: "item:1", kinds: ["itemObserved"]).Events);
        Assert.Equal(1, partial.Count);
        Assert.Equal(3, partial.Sequence);
        Assert.Equal(1u, partial.Item!.ActorGuid);
        Assert.True(partial.Item.SpawnLocationPresent);
        Assert.Equal("item:1", partial.EntityId);
        Assert.Equal(300_000, partial.ElapsedUs);
        Assert.Equal(300_000, partial.LastElapsedUs);
        Assert.Equal("item activity", partial.Detail);
    }

    [Fact] public async Task SeparatesClassKindAttributionOwnerWindowAndCaptureContinuity()
    {
        using var recording = new Recording();
        await recording.Append(
            Item(100_000, 1),
            Item(110_000, 2, "Shield"),
            Item(120_000, 3, kind: "itemClosed"),
            Item(130_000, 4, owner: 20),
            Item(140_000, 5, account: "ABC", attribution: "owner"),
            Item(150_000, 6, account: "ABC", attribution: "instigator"),
            new(0, 160_000, 0, "captureGap", null, "lost continuity"),
            Item(170_000, 7),
            Item(1_100_000, 8)
        );
        var events = recording.Query().Events;
        Assert.Equal(9, events.Count);
        Assert.Equal(8, events.Count(row => row.Item is not null));
        Assert.All(events, row => Assert.Equal(1, row.Count));
        Assert.Equal(8, events.Where(row => row.Item is not null).Select(row => row.GroupKey).Distinct().Count());
    }

    [Fact] public async Task GroupsByKnownAccountAcrossPawnChangesAndKeepsUnknownClassesUsable()
    {
        using var recording = new Recording();
        await recording.Append(Item(100_000, 1, "", owner: 10, account: "abc"), Item(200_000, 2, "", owner: 20, account: "ABC"));
        var group = Assert.Single(recording.Query().Events);
        Assert.Equal(2, group.Count);
        Assert.False(string.IsNullOrWhiteSpace(group.Item!.ClassPath));
        Assert.Null(group.Item.OwnerGuid);
    }

    [Fact] public async Task SameRawOwnerDoesNotMergeDifferentCausalPlayerLifetimes()
    {
        using var recording=new Recording();
        await recording.Append(
            Item(100_000,1) with {Player=new(Actor:new("first","life:1","pawn:1",10))},
            Item(200_000,2) with {Player=new(Actor:new("second","life:2","pawn:2",10))}
        );
        var events=recording.Query().Events;
        Assert.Equal(2,events.Count);
        Assert.All(events,ev=>Assert.Equal(1,ev.Count));
        Assert.Equal(new[]{"first","second"},events.Select(ev=>ev.Player!.Actor!.TrackId));
    }

    [Fact] public async Task BoundsPagesAndHonorsCancellationWithoutAffectingLaterQueries()
    {
        using var recording = new Recording();
        await recording.Append(Enumerable.Range(0, 205).Select(i => Item(i * 1_000_000L, (uint)i + 1)).ToArray());
        var first = recording.Query(toUs: 300_000_000);
        Assert.Equal(200, first.Events.Count);
        Assert.NotNull(first.NextSequence);
        Assert.Equal(5, recording.Query(toUs: 300_000_000, after: first.NextSequence!.Value).Events.Count);
        using var cancelled = new CancellationTokenSource();
        cancelled.Cancel();
        Assert.ThrowsAny<OperationCanceledException>(() => recording.Query(ct: cancelled.Token));
        Assert.Equal(200, recording.Query(toUs: 300_000_000).Events.Count);
    }

    [Fact] public async Task SavedReopenPreservesHistoricalCountsAndOrdinaryEvents()
    {
        using var recording = new Recording();
        await recording.Append(Item(100_000, 1), Item(200_000, 2), new(0, 250_000, 0, "decoderUnsupported", null, "diagnostic"));
        await recording.Writer.Complete("requested", 300_000);
        var reopened = new PlaybackOrchestrator(recording.Root);
        var historical = await reopened.GetEvents(new(recording.Status.Id, 0, 150_000), TestContext.Current.CancellationToken);
        Assert.Equal(1, Assert.Single(historical.Events).Count);
        var full = await reopened.GetEvents(new(recording.Status.Id, 0, 300_000), TestContext.Current.CancellationToken);
        Assert.Equal(2, full.Events.Count);
        Assert.Equal(2, full.Events[0].Count);
        Assert.Equal("decoderUnsupported", full.Events[1].Kind);
    }

    [Fact] public async Task QueriesTenThousandItemActivitiesAsOneExactBoundedBurst()
    {
        using var recording = new Recording();
        await recording.Append(Enumerable.Range(1, 10_000).Select(i => Item(100_000 + i, (uint)i)).ToArray());
        var durations = new List<double>();
        for (var i = 0; i < 5; i++)
        {
            var started = System.Diagnostics.Stopwatch.StartNew();
            var group = Assert.Single(recording.Query(kinds: ["itemObserved"], newest: true).Events);
            durations.Add(started.Elapsed.TotalMilliseconds);
            Assert.Equal(10_000, group.Count);
            Assert.Equal(110_000, group.LastElapsedUs);
        }
        Assert.Equal(5_000, Assert.Single(recording.Query(toUs: 105_000, kinds: ["itemObserved"]).Events).Count);
        output.WriteLine($"Ten-thousand-item query milliseconds: {string.Join(", ", durations.Select(value => value.ToString("F2")))}");
    }

    [Theory] [InlineData(false)] [InlineData(true)]
    public async Task OptionalItemIndexDoesNotChangeGroupsOrRequireBackfillingOldRows(bool missingTable)
    {
        using var recording = new Recording();
        await recording.Append(
            Item(100_000, 1, account: "ABC") with { Item = new("Sword", 1, 10, PlayFabId: "ABC", Attribution: "owner", CloseReason: 3) },
            Item(200_000, 2, account: "ABC") with { Item = new("Sword", 2, 10, PlayFabId: "ABC", Attribution: "owner", CloseReason: 3) }
        );
        var indexed = Assert.Single(recording.Query().Events);
        using (var connection = RecordingDatabase.Open(recording.Root))
        using (var command = connection.CreateCommand())
        {
            command.CommandText = missingTable ? "DROP TABLE itemActivities" : "DELETE FROM itemActivities WHERE sequence=2";
            command.ExecuteNonQuery();
        }
        var compatible = Assert.Single(recording.Query().Events);
        Assert.Equal(indexed.GroupKey, compatible.GroupKey);
        Assert.Equal(2, compatible.Count);
        Assert.Equal(indexed.Sequence, compatible.Sequence);
        Assert.Equal(3, compatible.Item!.CloseReason);
    }

    [Fact] public void ReadsLegacySchemaWithoutWritingOrRequiringAMigration()
    {
        var root = TestWorkspace.Create();
        try
        {
            var status = new RecordingStatus("legacy", new("127.0.0.1", 7777)) { State = "saved", Head = new(1, 100) };
            using (var connection = RecordingDatabase.Open(root))
            using (var command = connection.CreateCommand())
            {
                command.CommandText = "CREATE TABLE records(sequence INTEGER PRIMARY KEY,elapsedUs INTEGER,kind TEXT,entityId TEXT,event TEXT,entity TEXT,position TEXT); CREATE TABLE state(id INTEGER PRIMARY KEY,json TEXT); INSERT INTO state VALUES(1,$status); INSERT INTO records VALUES(1,100,'actorOpened','actor:1',$event,NULL,NULL)";
                command.Parameters.AddWithValue("$status", Wire.Serialize(status));
                command.Parameters.AddWithValue("$event", """{"sequence":1,"elapsedUs":100,"ordinal":0,"kind":"actorOpened","entityId":"actor:1","detail":"legacy"}""");
                command.ExecuteNonQuery();
            }
            var before = File.ReadAllBytes(Path.Combine(root, "telemetry.sqlite"));
            var page = TimelineQuery.Events(root, new("legacy", 0, 100), TestContext.Current.CancellationToken);
            Assert.Equal("actorOpened", Assert.Single(page.Events).Kind);
            Assert.Equal(before, File.ReadAllBytes(Path.Combine(root, "telemetry.sqlite")));
        }
        finally { SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }

    [Fact] public void LegacySearchAndOffsetApplyBeforeReturningThePage()
    {
        var root=TestWorkspace.Create();
        try
        {
            var status=new RecordingStatus("legacy",new("127.0.0.1",7777)){State="saved",Head=new(3,300)};
            using(var connection=RecordingDatabase.Open(root))
            using(var command=connection.CreateCommand())
            {
                command.CommandText="CREATE TABLE records(sequence INTEGER PRIMARY KEY,elapsedUs INTEGER,kind TEXT,entityId TEXT,event TEXT,entity TEXT,position TEXT); CREATE TABLE state(id INTEGER PRIMARY KEY,json TEXT); INSERT INTO state VALUES(1,$status)";
                command.Parameters.AddWithValue("$status",Wire.Serialize(status));command.ExecuteNonQuery();
                command.Parameters.Clear();
                command.CommandText="INSERT INTO records VALUES($sequence,$time,'actorOpened','actor:1',$event,NULL,NULL)";
                for(var i=1;i<=3;i++)
                {
                    command.Parameters.Clear();command.Parameters.AddWithValue("$sequence",i);command.Parameters.AddWithValue("$time",i*100);
                    command.Parameters.AddWithValue("$event",Wire.Serialize(new TelemetryEvent(i,i*100,0,"actorOpened","actor:1",i==2?"unrelated":"needle")));
                    command.ExecuteNonQuery();
                }
            }
            var page=TimelineQuery.Events(root,new("legacy",0,300,Limit:1,Search:"needle",Offset:1),TestContext.Current.CancellationToken);
            Assert.Equal(3,Assert.Single(page.Events).Sequence);
            Assert.Equal(2,page.MatchingGroups);
        }
        finally {Directory.Delete(root,true);}
    }
}
