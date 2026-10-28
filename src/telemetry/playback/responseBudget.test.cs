using System.Text.Json;
namespace SpellBook.Telemetry;

public class ResponseBudgetTests
{
    [Fact] public async Task ListsKeepOrdinaryStateAndPreserveOmittedRawEvidenceOnDisk()
    {
        var root=TestWorkspace.Create();
        try
        {
            var status=new RecordingStatus(Guid.NewGuid().ToString(),new("127.0.0.1",7777));
            using var writer=new RecordingOrchestrator(root,status,new(root,"unused","test",Environment.ProcessId,"test"));
            var body=new string('a',350_000);
            var source=new ObservationSource("fromServer",1,1,2,"component",0,100,100,0,"observed",RawBody:body);
            for(var i=0;i<4;i++)
                await writer.Append(new(i,i,DateTimeOffset.UtcNow,1,1,[1]),[
                    new(new(0,i,i,"diagnostic",$"pawn:{i}","detail",Player:new(Source:source)),
                        Player:new($"player{i}",$"life:{i}",$"pawn:{i}",(uint)i,true,i,0,Health:80,Profile:new Dictionary<string,object?>{{"large",body}},Source:source))
                ]);
            await writer.Flush(10);
            var playback=new PlaybackOrchestrator(root);
            var events=await playback.GetEvents(new(status.Id,0,10),TestContext.Current.CancellationToken);
            Assert.Equal(4,events.Events.Count);
            Assert.All(events.Events,ev=>{Assert.True(ev.DetailTruncated);Assert.Null(ev.Player!.Source!.RawBody);});
            Assert.True(ResponseBudget.Size(events)<Wire.MaxBytes);
            var players=await playback.GetPlayers(new(status.Id,10),TestContext.Current.CancellationToken);
            Assert.Equal(4,players.Players.Count);
            Assert.All(players.Players,player=>{Assert.True(player.DetailTruncated);Assert.Equal(80,player.Health);Assert.Null(player.Profile);});
            using var connection=RecordingDatabase.Open(root,true);
            using var command=connection.CreateCommand();command.CommandText="SELECT event FROM records LIMIT 1";
            var stored=JsonSerializer.Deserialize<TelemetryEvent>((string)command.ExecuteScalar()!,Wire.Json)!;
            Assert.Equal(body,stored.Player!.Source!.RawBody);
        }
        finally {Directory.Delete(root,true);}
    }
}
