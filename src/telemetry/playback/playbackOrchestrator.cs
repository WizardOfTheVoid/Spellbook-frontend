namespace SpellBook.Telemetry;
public sealed class PlaybackOrchestrator(string root)
{
    public Task<TelemetryFrame> GetFrame(RecordingStatus status, long atUs, CancellationToken ct = default,string? trackId=null)
    {
        if (atUs < 0) throw new ArgumentException("Invalid timeline cursor");
        using var c = RecordingDatabase.Open(root,true); using var tx = c.BeginTransaction();
        var committed = TimelineQuery.Status(c,tx);
        var at = Math.Min(atUs,committed.Head.ElapsedUs);
        var view=ReadViews.Resolve(committed,at);
        var projected=RecordingDatabase.HasProjection(c);
        var live=CommittedUpdates.Get(root);
        var useLive=live?.Status.Head==committed.Head && at==committed.Head.ElapsedUs;
        var entities = projected ? StateProjector.ReadProjection(c,tx,view,useLive?live!.Entities:null,ct) : StateProjector.Read(c,tx,at,ct);
        using var count=c.CreateCommand(); count.Transaction=tx; count.CommandText="SELECT COUNT(*) FROM entities WHERE firstUs<=$time AND hasPosition=1"; count.Parameters.AddWithValue("$time",at);
        var omitted=Math.Max(0,(long)count.ExecuteScalar()!-entities.Count);
        var players=projected?PlayerQueryReader.Read(c,tx,view,null,false,0,512,ct):[];
        var aliases=players.SelectMany(player=>player.Aliases??[]).ToHashSet();
        players=players.Where(player=>!aliases.Contains(player.TrackId)).GroupBy(player=>player.TrackId)
            .Select(group=>group.OrderBy(player=>player.ObservationKind!="pawn").ThenBy(player=>player.Direction!="fromServer").ThenByDescending(player=>player.ElapsedUs).First()).ToArray();
        players=StateProjector.LabelPlayers(c,tx,players);
        players=players.Select(ResponseBudget.Lean).ToArray();
        long packets=committed.PacketCount,loss=committed.LossCount;
        long rosterRevision=0,continuityRevision=0;
        if(projected)
        {
            using var progress=c.CreateCommand(); progress.Transaction=tx;
            progress.CommandText="SELECT packetCount,lossCount FROM packetProgress WHERE elapsedUs<=$time ORDER BY elapsedUs DESC,ordinal DESC LIMIT 1";
            progress.Parameters.AddWithValue("$time",at);
            using var row=progress.ExecuteReader();
            if(row.Read()) {packets=row.GetInt64(0);loss=row.GetInt64(1);} else {packets=0;loss=0;}
            row.Close();
            progress.CommandText="SELECT COALESCE(MAX(sequence),0) FROM membership WHERE elapsedUs<=$time AND sequence<=$head";
            progress.Parameters.AddWithValue("$head",view.ThroughSequence);
            rosterRevision=(long)progress.ExecuteScalar()!;
            progress.CommandText="SELECT COALESCE(MAX(sequence),0) FROM records WHERE kind='captureGap' AND elapsedUs<=$time AND sequence<=$head";
            continuityRevision=(long)progress.ExecuteScalar()!;
        }
        var frame = new TelemetryFrame(committed.Id,committed.Revision,at,committed.Head,committed.Cursor,entities,new() { ["packets"] = packets,["lostPackets"] = loss,["entitiesOmitted"] = omitted,["rosterRevision"]=rosterRevision,["continuityRevision"]=continuityRevision },view,players,projected?SummaryQuery.Read(c,tx,view,trackId):null,new(committed.SchemaVersion,committed.ProjectionVersion,projected,projected));
        if(ResponseBudget.Size(frame)>Wire.MaxBytes)
        {
            var overhead=ResponseBudget.Size(frame with {Entities=[],Players=[]});
            var boundedEntities=ResponseBudget.Take(entities,(Wire.MaxBytes-overhead)/2);
            var boundedPlayers=ResponseBudget.Take(players,Wire.MaxBytes-overhead-ResponseBudget.Size(boundedEntities)-64);
            frame.Coverage["entitiesOmitted"]+=entities.Count-boundedEntities.Count;
            frame.Coverage["playersOmitted"]=players.Count-boundedPlayers.Count;
            frame=frame with {Entities=boundedEntities,Players=boundedPlayers};
        }
        return Task.FromResult(frame);
    }
    public Task<TrajectoryPage> GetTrajectories(TrajectoryQuery query, CancellationToken ct) => Task.FromResult(TrajectoryQueryReader.Read(root,query,ct));
    public Task<EventPage> GetEvents(EventQuery query, CancellationToken ct) => Task.FromResult(TimelineQuery.Events(root,query,ct));
    public Task<PlayerPage> GetPlayers(PlayerQuery query,CancellationToken ct)=>Task.FromResult(PlayerQueryReader.Read(root,query,ct));
    public Task<MetricHistoryPage> GetMetricHistory(MetricHistoryQuery query,CancellationToken ct)=>Task.FromResult(MetricHistoryReader.Read(root,query,ct));
}
