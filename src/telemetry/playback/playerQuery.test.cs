namespace SpellBook.Telemetry;

public class PlayerCatalogTests
{
    [Fact] public async Task RetainsClearedContextsWithCausalPagingAndCurrentLifetimeReads()
    {
        using var fixture=new Fixture();
        var old=new PlayerStateSnapshot("old","life","pawn",1,true,10,0,Health:100);
        await fixture.Append(10,old);
        var early=await fixture.Playback.GetFrame(fixture.Status,10,TestContext.Current.CancellationToken);
        await fixture.Append(20,old with {TrackId="new",Health=75});
        var first=await fixture.Playback.GetPlayers(new(fixture.Status.Id,20,Limit:1),TestContext.Current.CancellationToken);
        Assert.Equal(1,first.NextOffset);
        var second=await fixture.Playback.GetPlayers(new(fixture.Status.Id,20,Offset:first.NextOffset!.Value,Limit:1,ReadView:first.ReadView),TestContext.Current.CancellationToken);
        Assert.Null(second.NextOffset);
        var players=first.Players.Concat(second.Players).ToArray();
        Assert.Equal(new[]{"new","old"},players.Select(player=>player.TrackId).Order().ToArray());
        Assert.False(Assert.Single(players,player=>player.TrackId=="old").Active);
        Assert.Equal(100,Assert.Single(players,player=>player.TrackId=="old").Health);
        Assert.True(Assert.Single(players,player=>player.TrackId=="new").Active);
        var active=await fixture.Playback.GetPlayers(new(fixture.Status.Id,20,IncludeDeparted:false),TestContext.Current.CancellationToken);
        Assert.Equal("new",Assert.Single(active.Players).TrackId);
        var lifetime=await fixture.Playback.GetPlayers(new(fixture.Status.Id,20,LifetimeId:"life"),TestContext.Current.CancellationToken);
        Assert.Equal("new",Assert.Single(lifetime.Players).TrackId);
        foreach(var view in new[]{early.ReadView!,early.ReadView! with {AtUs=20}})
        {
            var pinned=await fixture.Playback.GetPlayers(new(fixture.Status.Id,20,ReadView:view),TestContext.Current.CancellationToken);
            Assert.Equal("old",Assert.Single(pinned.Players).TrackId);
            Assert.True(pinned.Players[0].Active);
        }
    }

    [Fact] public async Task SuppressesAliasesOnlyAfterMergeAndPreservesDepartedSelectionScope()
    {
        using var fixture=new Fixture();
        var canonical=new PlayerStateSnapshot("canonical","life:1","pawn:1",1,true,10,0,Health:100);
        var alias=new PlayerStateSnapshot("alias","life:2","pawn:2",2,true,10,0,Direction:"toServer",Health:90);
        await fixture.Append(10,canonical,alias);
        var early=await fixture.Playback.GetFrame(fixture.Status,10,TestContext.Current.CancellationToken);
        await fixture.AppendEvent(15,new(0,15,0,"damage","pawn:2","test",Player:new(new("alias","life:2","pawn:2",2),Amount:5)));
        await fixture.Append(20,canonical with {Aliases=["alias"]});
        var merged=await fixture.Playback.GetPlayers(new(fixture.Status.Id,20),TestContext.Current.CancellationToken);
        Assert.Equal("canonical",Assert.Single(merged.Players).TrackId);
        await fixture.Append(30,canonical with {TrackId="new",Aliases=[]});
        var departed=await fixture.Playback.GetPlayers(new(fixture.Status.Id,30),TestContext.Current.CancellationToken);
        Assert.Equal(2,departed.Players.Count);
        var old=Assert.Single(departed.Players,player=>player.TrackId=="canonical");
        Assert.False(old.Active);
        Assert.Equal(new[]{"alias"},old.Aliases);
        foreach(var selected in new[]{"canonical","alias"})
        {
            var events=await fixture.Playback.GetEvents(new(fixture.Status.Id,0,30,Kinds:["damage"],TrackId:selected),TestContext.Current.CancellationToken);
            Assert.Single(events.Events);
            var history=await fixture.Playback.GetMetricHistory(new(fixture.Status.Id,0,30,selected),TestContext.Current.CancellationToken);
            Assert.Contains(history.Series.SelectMany(series=>series.Points),point=>point.Value==90);
            Assert.Contains(history.Series.SelectMany(series=>series.Points),point=>point.Value==100);
        }
        var before=await fixture.Playback.GetPlayers(new(fixture.Status.Id,30,ReadView:early.ReadView),TestContext.Current.CancellationToken);
        Assert.Equal(2,before.Players.Count);
        Assert.Contains(before.Players,player=>player.TrackId=="alias");
    }

    [Fact] public async Task LateCloseOfOlderLifetimeKeepsCurrentCanonicalContextActive()
    {
        using var fixture=new Fixture();
        var old=new PlayerStateSnapshot("same","oldLife","oldPawn",1,true,10,0,Health:100);
        var current=new PlayerStateSnapshot("same","newLife","newPawn",2,true,20,0,Health:60);
        await fixture.Append(10,old);
        await fixture.Append(20,current);
        await fixture.Append(30,old with {Active=false,Health=0});
        var catalog=await fixture.Playback.GetPlayers(new(fixture.Status.Id,30),TestContext.Current.CancellationToken);
        var player=Assert.Single(catalog.Players);
        Assert.Equal("newLife",player.LifetimeId);
        Assert.True(player.Active);
        Assert.Equal(60,player.Health);
    }

    [Fact] public async Task CatalogPageResolvesActiveContextsBeyondTheFrameRosterBudget()
    {
        using var fixture=new Fixture();
        await fixture.Append(10,Enumerable.Range(0,513).Select(index=>new PlayerStateSnapshot($"track{index:0000}",$"life{index:0000}",$"pawn{index:0000}",(uint)index,true,10,0)).ToArray());
        var page=await fixture.Playback.GetPlayers(new(fixture.Status.Id,10,Offset:512,Limit:1),TestContext.Current.CancellationToken);
        var player=Assert.Single(page.Players);
        Assert.Equal("track0512",player.TrackId);
        Assert.True(player.Active);
        Assert.Null(page.NextOffset);
    }

    [Fact] public async Task AccountEvidenceIsVisibleBeforePawnAndPawnRemainsTheLinkedCatalogRepresentative()
    {
        using var fixture=new Fixture();
        var account=new PlayerStateSnapshot("account","stateLife","stateEntity",200,true,10,0,
            PlayerStateGuid:200,PlayFabId:"AAAA",Profile:new Dictionary<string,object?> {["ping"]=12},ObservationKind:"account");
        await fixture.Append(10,account);
        var before=await fixture.Playback.GetPlayers(new(fixture.Status.Id,10),TestContext.Current.CancellationToken);
        Assert.Equal("account",Assert.Single(before.Players).ObservationKind);
        var frame=await fixture.Playback.GetFrame(fixture.Status,10,TestContext.Current.CancellationToken);
        Assert.Empty(frame.Entities);
        var pawn=new PlayerStateSnapshot("account","pawnLife","pawnEntity",100,true,20,0,PlayerStateGuid:200,PlayFabId:"AAAA",Health:90,
            Inventory:[new(0,300,"/Game/Inventory/Weapons/Weapon_Sword.Default__Weapon_Sword_C")]);
        await fixture.Append(20,pawn);
        await fixture.Append(30,account with {Profile=new Dictionary<string,object?> {["ping"]=18}});
        var latest=await fixture.Playback.GetPlayers(new(fixture.Status.Id,30),TestContext.Current.CancellationToken);
        Assert.Equal("pawn",Assert.Single(latest.Players).ObservationKind);
        Assert.Equal(90,latest.Players[0].Health);
        var latestFrame=await fixture.Playback.GetFrame(fixture.Status,30,TestContext.Current.CancellationToken);
        var displayed=Assert.Single(latestFrame.Players!);
        Assert.Equal("pawn",displayed.ObservationKind);
        Assert.Equal(90,displayed.Health);
        Assert.Equal(300u,Assert.Single(displayed.Inventory!).ItemGuid);
        var scoped=await fixture.Playback.GetPlayers(new(fixture.Status.Id,30,LifetimeId:"stateLife"),TestContext.Current.CancellationToken);
        Assert.Equal(18L,((System.Text.Json.JsonElement)Assert.Single(scoped.Players).Profile!["ping"]!).GetInt64());
        var pinned=await fixture.Playback.GetPlayers(new(fixture.Status.Id,30,ReadView:before.ReadView),TestContext.Current.CancellationToken);
        Assert.Equal("account",Assert.Single(pinned.Players).ObservationKind);
        Assert.Equal("stateLife",pinned.Players[0].LifetimeId);
    }

    private sealed class Fixture:IDisposable
    {
        private readonly string root=TestWorkspace.Create();
        private long ordinal;
        public RecordingStatus Status { get; }=new(Guid.NewGuid().ToString(),new("127.0.0.1",7777));
        public RecordingOrchestrator Writer { get; }
        public PlaybackOrchestrator Playback { get; }
        public Fixture()
        {
            Writer=new(root,Status,new(root,"unused","test",Environment.ProcessId,"test"));
            Playback=new(root);
        }
        public async Task Append(long time,params PlayerStateSnapshot[] players)
        {
            await Writer.Append(new(ordinal++,time,DateTimeOffset.UtcNow,1,1,[1]),players.Select(player=>new TrackedRecord(new(0,time,ordinal,"state",player.EntityId,"test"),Player:player)).ToArray());
            await Writer.Flush(time);
        }
        public async Task AppendEvent(long time,TelemetryEvent ev)
        {
            await Writer.Append(new(ordinal++,time,DateTimeOffset.UtcNow,1,1,[1]),[new(ev)]);
            await Writer.Flush(time);
        }
        public void Dispose() {Writer.Dispose();Directory.Delete(root,true);}
    }
}
