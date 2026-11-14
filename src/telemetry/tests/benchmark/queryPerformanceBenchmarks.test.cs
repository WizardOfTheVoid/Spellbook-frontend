using System.Diagnostics;
namespace SpellBook.Telemetry;

[Collection("Telemetry performance")]
public class QueryPerformanceBenchmarks(ITestOutputHelper output)
{
    public static bool Enabled=>Environment.GetEnvironmentVariable("TELEMETRY_QUERY_RECORDING") is {Length:>0};

    [Theory(Skip="Explicit retained full-history rewind benchmark",SkipUnless=nameof(Enabled))]
    [InlineData(30)]
    [InlineData(1800)]
    public async Task FilteredRewindsRemainBoundedAndExcludeFutureContributions(int seconds)
    {
        var root=Environment.GetEnvironmentVariable("TELEMETRY_QUERY_RECORDING")!;
        using(var migration=RecordingDatabase.Open(root)) RecordingDatabase.Initialize(migration);
        var status=RecordingDatabase.Status(root)!;
        var samples=new List<double>();
        for(var index=0;index<40;index++)
        {
            var watch=Stopwatch.StartNew();
            var page=await new PlaybackOrchestrator(root).GetEvents(new(status.Id,0,seconds*1_000_000L,Kinds:["attackStart","damage","healing"],NewestFirst:true),TestContext.Current.CancellationToken);
            samples.Add(watch.Elapsed.TotalMilliseconds);
            Assert.Equal((seconds+1)*64,page.MatchingGroups);
            Assert.All(page.Events,row=>Assert.InRange(row.ElapsedUs,0,seconds*1_000_000L));
        }
        var report=new {seconds,p95Ms=samples.Skip(1).Order().ElementAt(37),samples};
        if(Environment.GetEnvironmentVariable("TELEMETRY_QUERY_REPORT") is {} reportPath)
            File.WriteAllText(Path.ChangeExtension(reportPath,$"rewind{seconds}.json"),Wire.Serialize(report));
        Assert.InRange(report.p95Ms,0,50);
    }

    [Fact(Skip="Explicit retained full-history search measurement",SkipUnless=nameof(Enabled))]
    public async Task MeasuresSearchWithExactFilteredCounts()
    {
        var root=Environment.GetEnvironmentVariable("TELEMETRY_QUERY_RECORDING")!;
        using(var migration=RecordingDatabase.Open(root)) RecordingDatabase.Initialize(migration);
        var status=RecordingDatabase.Status(root)!;
        var playback=new PlaybackOrchestrator(root);
        var reports=new List<object>();
        foreach(var (kind,search,expected) in new[]{("attackStart","synthetic",230400L),("attackStart","absent-value",0L),("itemObserved","Sword",1L),("itemObserved","absent-value",0L),("attackRequested","synthetic",0L)})
        {
            var samples=new List<double>();
            for(var index=0;index<8;index++)
            {
                var watch=Stopwatch.StartNew();
                var page=await playback.GetEvents(new(status.Id,0,status.Head.ElapsedUs,Kinds:[kind],Search:search,NewestFirst:true),TestContext.Current.CancellationToken);
                samples.Add(watch.Elapsed.TotalMilliseconds);
                Assert.Equal(expected,page.MatchingGroups);
            }
            reports.Add(new {kind,search,expected,p95Ms=samples.Skip(1).Max(),samples});
        }
        if(Environment.GetEnvironmentVariable("TELEMETRY_QUERY_REPORT") is {} reportPath)
            File.WriteAllText(Path.ChangeExtension(reportPath,"search.json"),Wire.Serialize(reports));
        output.WriteLine(Wire.Serialize(reports));
    }

    [Theory(Skip="Explicit retained full-history tab benchmark",SkipUnless=nameof(Enabled))]
    [InlineData("combat",0)]
    [InlineData("items",1)]
    [InlineData("kills",0)]
    [InlineData("syntheticCombat",230400)]
    public async Task RetainedTabQueriesMeetLatencyTarget(string tab,long expected)
    {
        var root=Environment.GetEnvironmentVariable("TELEMETRY_QUERY_RECORDING")!;
        using(var migration=RecordingDatabase.Open(root)) RecordingDatabase.Initialize(migration);
        var status=RecordingDatabase.Status(root)!;
        var playback=new PlaybackOrchestrator(root);
        string[] kinds=tab switch {
            "combat"=>["damage","healing","attackRequested","attackCancelRequested","abilityInitiated","abilityInvocationCompleted","abilityRequested","heavyAttackDecision","heldInputAdded","heldInputRemoved","parryRequested","statusChanged","combatStateChanged","playerStateUpdated","playerStatistics"],
            "items"=>["itemObserved","itemDestroyed","inventoryChanged","itemReappeared","itemDormant","itemNoLongerRelevant","itemChannelClosed","itemTornOff","itemOwnerChanged","itemInstigatorChanged","itemCoverageReset","itemClassified","objectObserved","objectReappeared","objectDestroyed","objectDormant","objectNoLongerRelevant","objectChannelClosed","objectTornOff"],
            "kills"=>["death","disconnect"],
            _=>["attackStart","damage","healing"]
        };
        var samples=new List<double>();
        for(var index=0;index<40;index++)
        {
            var watch=Stopwatch.StartNew();
            var page=await playback.GetEvents(new(status.Id,0,status.Head.ElapsedUs,Kinds:kinds,NewestFirst:true),TestContext.Current.CancellationToken);
            samples.Add(watch.Elapsed.TotalMilliseconds);
            Assert.Equal(expected,page.MatchingGroups);
        }
        var report=new {tab,expected,kinds,p95Ms=samples.Skip(1).Order().ElementAt(37),samples};
        if(Environment.GetEnvironmentVariable("TELEMETRY_QUERY_REPORT") is {} reportPath)
            File.WriteAllText(Path.ChangeExtension(reportPath,$"{tab}.json"),Wire.Serialize(report));
        output.WriteLine(Wire.Serialize(report));
        Assert.InRange(report.p95Ms,0,50);
    }

    [Fact(Skip="Explicit retained full-history query benchmark",SkipUnless=nameof(Enabled))]
    public async Task RetainedFullHistoryQueriesMeetLatencyTargets()
    {
        var root=Environment.GetEnvironmentVariable("TELEMETRY_QUERY_RECORDING")!;
        using(var migration=RecordingDatabase.Open(root)) RecordingDatabase.Initialize(migration);
        var status=RecordingDatabase.Status(root)!;
        var playback=new PlaybackOrchestrator(root);
        var frames=new List<double>();var groups=new List<double>();var seeks=new List<double>();
        for(var index=0;index<40;index++)
        {
            var watch=Stopwatch.StartNew();
            var frame=await playback.GetFrame(status,status.Head.ElapsedUs,TestContext.Current.CancellationToken);
            frames.Add(watch.Elapsed.TotalMilliseconds);
            Assert.Equal(64,frame.Players!.Count);
            watch.Restart();
            var events=await playback.GetEvents(new(status.Id,0,status.Head.ElapsedUs,NewestFirst:true),TestContext.Current.CancellationToken);
            groups.Add(watch.Elapsed.TotalMilliseconds);
            Assert.Equal(230400,frame.Summary!.Counts["attackStart"]);
            Assert.Equal(234177,events.MatchingGroups);
            watch.Restart();
            await playback.GetFrame(status,status.Head.ElapsedUs*(index+1)/41,TestContext.Current.CancellationToken);
            seeks.Add(watch.Elapsed.TotalMilliseconds);
        }
        double P95(List<double> samples)=>samples.Skip(1).Order().ElementAt(37);
        var report=new {status.Id,buildConfiguration="Debug test host",positions=6_912_000,frameP95Ms=P95(frames),groupP95Ms=P95(groups),seekP95Ms=P95(seeks),frames,groups,seeks};
        var reportPath=Environment.GetEnvironmentVariable("TELEMETRY_QUERY_REPORT");
        if(reportPath is not null) File.WriteAllText(reportPath,Wire.Serialize(report));
        output.WriteLine(Wire.Serialize(report));
        Assert.InRange(report.frameP95Ms,0,50);
        Assert.InRange(report.groupP95Ms,0,50);
        Assert.InRange(report.seekP95Ms,0,250);
    }
}
