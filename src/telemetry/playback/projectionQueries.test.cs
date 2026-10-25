namespace SpellBook.Telemetry;

public class ProjectionQueryTests
{
    [Fact] public async Task CausalAliasesCombineHistoricalEvidenceOnceOnlyAfterMerge()
    {
        var root=TestWorkspace.Create();
        try
        {
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777));
            using var writer=new RecordingOrchestrator(root,status,new(root,"unused","test",Environment.ProcessId,"test"));
            var old=new PlayerStateSnapshot("old","life:1","pawn:1",1,true,10,0,Health:80);
            var canonical=new PlayerStateSnapshot("canonical","life:2","pawn:2",2,true,10,0,Health:100);
            var actor=new PlayerReference("old","life:1","pawn:1",1);
            var target=new PlayerReference("canonical","life:2","pawn:2",2);
            await writer.Append(new(0,10,DateTimeOffset.UtcNow,1,1,[1]),[
                new(new(0,10,0,"state","pawn:1","state"),Player:old),
                new(new(0,10,0,"state","pawn:2","state"),Player:canonical),
                new(new(0,10,0,"damage","pawn:1","damage",Player:new(actor,target,Amount:5)))
            ]);
            await writer.Flush(10);
            var playback=new PlaybackOrchestrator(root);
            var early=await playback.GetFrame(status,10,TestContext.Current.CancellationToken);
            await writer.Append(new(1,20,DateTimeOffset.UtcNow,1,1,[1]),[
                new(new(0,20,1,"state","pawn:2","merge"),Player:canonical with {Aliases=["old"],ElapsedUs=20}),
            ]);
            await writer.Flush(20);
            var after=await playback.GetFrame(status,20,TestContext.Current.CancellationToken,"old");
            Assert.Equal(1,after.Summary!.KnownPlayers);
            Assert.Equal(1,after.Summary.Counts["damage"]);
            var events=await playback.GetEvents(new(status.Id,0,20,TrackId:"old",Kinds:["damage"]),TestContext.Current.CancellationToken);
            Assert.Single(events.Events);
            var history=await playback.GetMetricHistory(new(status.Id,0,20,"old"),TestContext.Current.CancellationToken);
            Assert.Contains(history.Series.SelectMany(series=>series.Points),point=>point.Value==100);
            var before=await playback.GetMetricHistory(new(status.Id,0,20,"old",ReadView:early.ReadView),TestContext.Current.CancellationToken);
            Assert.DoesNotContain(before.Series.SelectMany(series=>series.Points),point=>point.Value==100);
        }
        finally {Directory.Delete(root,true);}
    }

    [Fact] public async Task PinsDependentReadsAndKeepsHistoricalPlayersOutOfFutureLifetimes()
    {
        var root = TestWorkspace.Create();
        try
        {
            var status = new RecordingStatus(Guid.NewGuid().ToString(), new("127.0.0.1",7777));
            using var writer = new RecordingOrchestrator(root,status,new(root,"unused","test",Environment.ProcessId,"test"));
            await writer.Append(new(0,100,DateTimeOffset.UtcNow,1,1,[1]),[
                new(new(0,100,0,"health","pawn:1","health"),Player:new("track","life:1","pawn:1",1,true,100,0,Health:100))
            ]);
            await writer.Flush(100);
            var playback = new PlaybackOrchestrator(root);
            var frame = await playback.GetFrame(status,100);
            await writer.Append(new(1,200,DateTimeOffset.UtcNow,1,1,[1]),[
                new(new(0,200,1,"health","pawn:1","health"),Player:new("track","life:1","pawn:1",1,true,200,0,Health:25))
            ]);
            await writer.Flush(200);
            var page = await playback.GetPlayers(new(status.Id,200,ReadView:frame.ReadView),CancellationToken.None);
            Assert.Equal(100,Assert.Single(page.Players).Health);
            var metrics = await playback.GetMetricHistory(new(status.Id,0,200,"track",ReadView:frame.ReadView),CancellationToken.None);
            Assert.All(metrics.Series.SelectMany(series=>series.Points),point=>Assert.True(point.ElapsedUs<=100));
            await Assert.ThrowsAsync<ReadViewMismatchException>(()=>playback.GetPlayers(new(status.Id,200,ReadView:new("wrong",1,100)),CancellationToken.None));
        }
        finally { Directory.Delete(root,true); }
    }

    [Fact] public async Task BoundsCombinedTrajectoriesAndRetainsExtremaAndCaptureGapBreaks()
    {
        var root = TestWorkspace.Create();
        try
        {
            var status = new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777));
            using var writer = new RecordingOrchestrator(root,status,new(root,"unused","test",Environment.ProcessId,"test"));
            for (var i=0;i<100;i++)
            {
                var rows = Enumerable.Range(0,64).Select(player=>{
                    var id=$"pawn:{player}";
                    var point=new PositionObservation(id,i*1000,0,0,new(i==49?500:0,i,0),new(),"test","world",0,"test");
                    return new TrackedRecord(new(0,i*1000,0,"position",id,"test"),new(id,(uint)player,player,"pawn",true),point);
                }).ToList();
                if(i==50) rows.Insert(0,new(new(0,i*1000,0,"captureGap",null,"test")));
                await writer.Append(new(i,i*1000,DateTimeOffset.UtcNow,1,1,[1]),rows);
            }
            await writer.Flush(100_000);
            var page=await new PlaybackOrchestrator(root).GetTrajectories(new(status.Id,0,100_000,Enumerable.Range(0,64).Select(i=>$"pawn:{i}").ToArray(),10000),CancellationToken.None);
            Assert.InRange(page.Paths.Sum(path=>path.Points.Count),1,2048);
            Assert.Contains(page.Paths.SelectMany(path=>path.Points),point=>point.Location.X==500);
            Assert.Contains(page.Paths.SelectMany(path=>path.Points),point=>point.ElapsedUs>=50_000);
            Assert.All(page.Paths,path=>Assert.False(path.Points.Any(point=>point.ElapsedUs<50_000)&&path.Points.Any(point=>point.ElapsedUs>=50_000)));
        }
        finally { Directory.Delete(root,true); }
    }
}
