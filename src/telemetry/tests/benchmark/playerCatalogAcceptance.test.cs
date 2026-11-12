using System.Diagnostics;
namespace SpellBook.Telemetry;

[Collection("Telemetry performance")]
public class PlayerCatalogAcceptanceTests(ITestOutputHelper output)
{
    public static bool Enabled=>Environment.GetEnvironmentVariable("TELEMETRY_CATALOG_QA_ROOT") is {Length:>0};

    [Fact(Skip="Explicit saved TJ and retained full-hour catalog acceptance",SkipUnless=nameof(Enabled))]
    public async Task RetainedCatalogPreservesClearedTracksAndReadsFullHistoryOnce()
    {
        var qa=Environment.GetEnvironmentVariable("TELEMETRY_CATALOG_QA_ROOT")!;
        var liveRoot=Path.Combine(qa,"live","recordings","50ec1c95-630f-44b2-b93f-e78fd7f024f0");
        var status=RecordingDatabase.Status(liveRoot)!;
        var playback=new PlaybackOrchestrator(liveRoot);
        var frame=await playback.GetFrame(status,45_000_000,TestContext.Current.CancellationToken);
        var page=await playback.GetPlayers(new(status.Id,frame.AtUs,ReadView:frame.ReadView),TestContext.Current.CancellationToken);
        Assert.Equal(8,frame.Summary!.KnownPlayers);
        Assert.Equal(8,page.Players.Count(player=>player.Direction=="fromServer"));
        Assert.Single(page.Players,player=>player.Direction=="toServer");
        Assert.False(Assert.Single(page.Players,player=>player.TrackId=="player2").Active);
        Assert.False(Assert.Single(page.Players,player=>player.TrackId=="player3").Active);
        Assert.DoesNotContain(page.Players,player=>player.TrackId=="player8");
        Assert.Null(page.NextOffset);
        var historyRoot=Path.Combine(qa,"benchmarkRecordings","c56bd0af-2b1b-478b-8c9c-a6dbbcfc0b41");
        var historyStatus=RecordingDatabase.Status(historyRoot)!;
        var watch=Stopwatch.StartNew();
        var history=await new PlaybackOrchestrator(historyRoot).GetPlayers(new(historyStatus.Id,historyStatus.Head.ElapsedUs),TestContext.Current.CancellationToken);
        var catalogMs=watch.Elapsed.TotalMilliseconds;
        Assert.Equal(64,history.Players.Count);
        Assert.All(history.Players,player=>Assert.True(player.Active));
        Assert.Null(history.NextOffset);
        var report=new {buildConfiguration="Debug test host",readOnly=true,liveFrame=frame,liveCatalog=page,historyRecordingId=historyStatus.Id,historyCatalogMs=catalogMs,historyCatalog=history};
        File.WriteAllText(Path.Combine(qa,"playerCatalogAcceptance.json"),Wire.Serialize(report));
        output.WriteLine($"Full-hour catalog read: {catalogMs:F3} ms; {history.Players.Count} canonical rows");
    }
}
