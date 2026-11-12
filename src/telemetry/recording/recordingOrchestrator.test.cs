namespace SpellBook.Telemetry;
public class RecordingOrchestratorTests
{
    [Fact] public async Task LargeHistorySnapshotsKeepLiveActorsAndReportOmittedClosedSegments()
    {
        var root=TestWorkspace.Create();
        try
        {
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){StartedAtUtc=DateTimeOffset.UtcNow,State="recording"};
            using var writer=new RecordingOrchestrator(root,status,new(root,"unused",Guid.NewGuid().ToString(),Environment.ProcessId,"test"){FreeSpaceFloor=0});
            var rows=Enumerable.Range(0,601).Select(i=>{
                var id=$"pawn:{i}";var point=new PositionObservation(id,i*1000,0,i,new(i,0,0),new(i,0,0),"test","world",0,"test");
                return new TrackedRecord(new(i,i*1000,0,i==0 ? "position" : "actorClosed",id,"test"),new(id,(uint)i,i,"pawn",i==0,Position:point),point);
            }).ToArray();
            await writer.Append(new(0,700_000,DateTimeOffset.UtcNow,1,1,[1]),rows);
            await writer.Complete("requested",700_000);
            var frame=await new PlaybackOrchestrator(root).GetFrame(status,700_000,TestContext.Current.CancellationToken);
            Assert.Contains(frame.Entities,e=>e.EntityId=="pawn:0" && e.Active);
            Assert.InRange(frame.Entities.Count,1,512);
            Assert.Equal(601-frame.Entities.Count,frame.Coverage["entitiesOmitted"]);
            Assert.InRange(System.Text.Encoding.UTF8.GetByteCount(Wire.Serialize(frame)),1,Wire.MaxBytes);
        }
        finally { Directory.Delete(root,true); }
    }
    [Fact] public async Task BoundsTrajectoryResponsesAcrossTheWholeQuery()
    {
        var root=TestWorkspace.Create();
        try
        {
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777)){StartedAtUtc=DateTimeOffset.UtcNow,State="recording"};
            using var writer=new RecordingOrchestrator(root,status,new(root,"unused",Guid.NewGuid().ToString(),Environment.ProcessId,"test"){FreeSpaceFloor=0});
            var rows=Enumerable.Range(0,4000).Select(i=>{
                var point=new PositionObservation("pawn",i*1000,0,i,new(i,0,0),new(i,0,0),"synthetic","world",0,"test");
                return new TrackedRecord(new(i,i*1000,0,"position","pawn","test"),new("pawn",1,1,"pawn",true,Position:point),point);
            }).ToArray();
            await writer.Append(new(0,4_000_000,DateTimeOffset.UtcNow,1,1,[1]),rows);
            await writer.Complete("requested",1000);
            Assert.Equal(4_000_000,status.Head.ElapsedUs);
            var page=await new PlaybackOrchestrator(root).GetTrajectories(new(status.Id,0,4_000_000,["pawn"],10000),TestContext.Current.CancellationToken);
            Assert.True(page.Truncated);
            Assert.InRange(System.Text.Encoding.UTF8.GetByteCount(Wire.Serialize(page)),1,Wire.MaxBytes);
        }
        finally { Directory.Delete(root,true); }
    }
    [Fact] public async Task RewindsDuringWritesAndPreservesPostStopNamesWithoutExtendingHead()
    {
        var root = TestWorkspace.Create();
        Directory.CreateDirectory(root);
        try
        {
            var status = new RecordingStatus(Guid.NewGuid().ToString(), new("127.0.0.1", 7777)) { StartedAtUtc = DateTimeOffset.UtcNow, State = "recording" };
            using var writer = new RecordingOrchestrator(root, status, new(root,"unused", Guid.NewGuid().ToString(), Environment.ProcessId,"test") { FreeSpaceFloor = 0 });
            var entity = new TelemetryEntity("1:1:2", 2, 1, "pawn", true, "D6A2C4BB2600FA9");
            var point = new PositionObservation(entity.EntityId, 1000, 0, 1, new(1,2,3), new(1,2,3), "test", "world", 0, "test", entity.PlayFabId);
            await writer.Append(new(0,1000,DateTimeOffset.UtcNow,1,1,[1]), [new(new(1,1000,0,"position",entity.EntityId,"test"),entity with { Position = point },point)]);
            await writer.Flush(2000);
            var playback = new PlaybackOrchestrator(root);
            Assert.Empty((await playback.GetFrame(status, 0)).Entities);
            Assert.Single((await playback.GetFrame(status, 1500)).Entities);
            await writer.Complete("requested", 3000);
            var head = status.Head;
            writer.AppendNames([new(entity.PlayFabId!, "Test name", "spellbookProduction", DateTimeOffset.UtcNow)]);
            Assert.Equal(head, status.Head);
            Assert.Equal("Test name", (await playback.GetFrame(status,3000)).Entities.Single().Name);
            Assert.Throws<ArgumentException>(() => writer.AppendNames([new("ABCD", "Wrong account", "spellbookProduction", DateTimeOffset.UtcNow)]));
        }
        finally { Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools(); Directory.Delete(root, true); }
    }
}
