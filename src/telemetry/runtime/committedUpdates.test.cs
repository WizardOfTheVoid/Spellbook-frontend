namespace SpellBook.Telemetry;

public class CommittedUpdatesTests
{
    [Fact] public async Task PublishesOnlyCommittedChangesAndCoalescesSlowSubscribers()
    {
        var root=TestWorkspace.Create();
        try
        {
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777));
            using var writer=new RecordingOrchestrator(root,status,new(root,"unused","test",Environment.ProcessId,"test"));
            await writer.Flush(0);
            using var updates=CommittedUpdates.Subscribe(status.Id);
            await writer.Append(new(0,100,DateTimeOffset.UtcNow,1,1,[1]),[]);
            using(var noCommit=new CancellationTokenSource(30))
                await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>updates.Wait(noCommit.Token));
            await writer.Flush(100);
            for(var i=0;i<10;i++) await writer.Flush(200+i);
            await updates.Wait(TestContext.Current.CancellationToken);
            using var coalesced=new CancellationTokenSource(30);
            await Assert.ThrowsAnyAsync<OperationCanceledException>(()=>updates.Wait(coalesced.Token));
        }
        finally {Directory.Delete(root,true);}
    }
}
