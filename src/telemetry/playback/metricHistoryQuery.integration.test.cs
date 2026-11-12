namespace SpellBook.Telemetry;

public class MetricHistoryIntegrationTests
{
    [Fact] public async Task SeedsLastKnownValueAtTheWindowStart()
    {
        using var recording = new MetricRecording();
        await recording.Add(10, 80);
        await recording.Add(30, 40);

        var page = await recording.Read(20, 30);

        Assert.Equal([new MetricPoint(20, 80, "life"), new(30, 40, "life")], Assert.Single(page.Series).Points);
        Assert.False(page.Truncated);
    }

    [Fact] public async Task PreservesAnUnknownSeedAndNeverExtendsPastAPinnedReadView()
    {
        using var recording = new MetricRecording();
        await recording.Add(10, 80);
        await recording.Add(20, null);
        var view = (await recording.Read(0, 20)).ReadView;
        await recording.Add(30, 50);

        var page = await recording.Read(25, 30);
        Assert.Equal([new MetricPoint(25, null, "life"), new(30, 50, "life")], Assert.Single(page.Series).Points);
        var pinned = await recording.Read(25, 30, view: view);
        Assert.Empty(Assert.Single(pinned.Series).Points);
    }

    [Fact] public async Task IncludesAliasHistoryOnlyWhenTheMergeIsVisible()
    {
        using var recording = new MetricRecording();
        await recording.Add(10, 80, "oldLife", "old");
        await recording.Add(20, 100, "newLife", "canonical");
        var view = (await recording.Read(0, 20, track: "old")).ReadView;
        await recording.Add(30, 100, "newLife", "canonical", ["old"]);

        var early = await recording.Read(15, 30, track: "old", view: view);
        Assert.Equal([new MetricPoint(15, 80, "oldLife")], Assert.Single(early.Series).Points);
        var merged = await recording.Read(15, 30, track: "old");
        Assert.Equal([new MetricPoint(15, 80, "oldLife"), new(20, null, "newLife"), new(20, 100, "newLife")], Assert.Single(merged.Series).Points);
    }

    [Fact] public async Task RetainsRecentValuesWhenGapsExceedThePointBudget()
    {
        using var recording = new MetricRecording();
        for (var i = 0; i <= 160; i++) await recording.Add(i, i % 2 == 0 ? i : null);

        var page = await recording.Read(0, 160, limit: 8);
        var points = Assert.Single(page.Series).Points;

        Assert.True(page.Truncated);
        Assert.InRange(points.Count, 1, 8);
        Assert.Equal(new MetricPoint(160, 160, "life"), points[^1]);
        Assert.Contains(points, point => point.Value is null);
        for (var i = 1; i < points.Count; i++)
            Assert.False(points[i - 1].Value.HasValue && points[i].Value.HasValue);
    }

    [Fact] public async Task ClearsThePriorTrackAndSeedsTheNewTrackEvenWhenTheValueIsUnchanged()
    {
        using var recording = new MetricRecording();
        await recording.Add(10, 80, track: "old");
        await recording.Add(20, 80, track: "new");

        var old = await recording.Read(15, 20, track: "old");
        Assert.Equal([new MetricPoint(15, 80, "life"), new(20, null, "life")], Assert.Single(old.Series).Points);
        var current = await recording.Read(15, 20, track: "new");
        Assert.Equal([new MetricPoint(20, 80, "life")], Assert.Single(current.Series).Points);
    }

    [Fact] public async Task OrdersAnAliasMergeBoundaryBeforeItsUnchangedValue()
    {
        using var recording = new MetricRecording();
        await recording.Add(10, 80, track: "old");
        await recording.Add(20, 80, track: "canonical", aliases: ["old"]);

        var page = await recording.Read(15, 20, track: "old");

        Assert.Equal([new MetricPoint(15, 80, "life"), new(20, null, "life"), new(20, 80, "life")], Assert.Single(page.Series).Points);
        var seeded = await recording.Read(21, 30, track: "old");
        Assert.Empty(Assert.Single(seeded.Series).Points);
        await recording.Add(30, 80, track: "canonical", aliases: ["old"]);
        seeded = await recording.Read(21, 30, track: "old");
        Assert.Equal([new MetricPoint(21, 80, "life")], Assert.Single(seeded.Series).Points);
    }

    [Fact] public async Task KeepsRecentLifetimeEndpointsWithoutConnectingAcrossOmittedLifetimes()
    {
        using var recording = new MetricRecording();
        for (var life = 0; life < 4; life++)
        for (var i = 0; i < 16; i++)
            await recording.Add(life * 20 + i, i, $"life:{life}");

        var page = await recording.Read(0, 75, limit: 8);
        var points = Assert.Single(page.Series).Points;

        Assert.True(page.Truncated);
        Assert.InRange(points.Count, 1, 8);
        Assert.Contains(new MetricPoint(60, 0, "life:3"), points);
        Assert.Equal(new MetricPoint(75, 15, "life:3"), points[^1]);
        for (var i = 1; i < points.Count; i++)
            if (points[i - 1].Value.HasValue && points[i].Value.HasValue)
                Assert.Equal(points[i - 1].LifetimeId, points[i].LifetimeId);
    }

    private sealed class MetricRecording : IDisposable
    {
        private readonly string root = TestWorkspace.Create();
        private readonly RecordingStatus status = new(Guid.NewGuid().ToString(), new("127.0.0.1", 7777));
        private readonly RecordingOrchestrator writer;
        private long ordinal;

        public MetricRecording() => writer = new(root, status, new(root, "unused", "test", Environment.ProcessId, "test"));

        public async Task Add(long time, double? health, string life = "life", string track = "track", string[]? aliases = null)
        {
            var packet = ordinal++;
            await writer.Append(new(packet, time, DateTimeOffset.UtcNow, 1, 1, [1]), [
                new(new(0, time, packet, "playerStateUpdated", life, "state"),
                    Player: new(track, life, life, 1, true, time, 0, Health: health, Aliases: aliases))
            ]);
            await writer.Flush(time);
        }

        public Task<MetricHistoryPage> Read(long from, long to, string track = "track", int limit = 512, ReadView? view = null)
            => new PlaybackOrchestrator(root).GetMetricHistory(new(status.Id, from, to, track, ["health"], limit, view), TestContext.Current.CancellationToken);

        public void Dispose()
        {
            writer.Dispose();
            Directory.Delete(root, true);
        }
    }
}
