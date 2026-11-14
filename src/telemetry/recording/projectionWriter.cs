using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public sealed class ProjectionWriter(PreparedCommands commands)
{
    private readonly Dictionary<string,TelemetryEntity> entities=[];
    private readonly Dictionary<string,PlayerStateSnapshot> players=[];
    private readonly Dictionary<(string Scope,string Kind),(long Count,double? Amount)> totals=[];
    private readonly Dictionary<(string Key,string Scope),TelemetryEvent> groups=[];
    private readonly HashSet<string> active=[];
    private readonly HashSet<string> positioned=[];
    private readonly HashSet<string> knownTracks=[];
    private readonly Dictionary<string,string> aliases=[];
    private long membershipChanges;
    public long Positions { get; private set; }
    public IReadOnlyDictionary<string,TelemetryEntity> Entities => entities;
    public IReadOnlyDictionary<string,PlayerStateSnapshot> Players => players;

    public void Append(SqliteTransaction transaction, TelemetryEvent ev, TelemetryEntity? entity, PositionObservation? point, PlayerStateSnapshot? player, long continuity)
    {
        void Write(string sql,params (string Name,object? Value)[] values)=>commands.Execute(transaction,sql,values);
        if(entity is not null)
        {
            var sparse=entity with { Position=null,NameObservedAtUtc=null };
            if(!entities.TryGetValue(entity.EntityId,out var prior) || prior with { Position=null } != sparse)
            {
                Write("INSERT INTO entityStates VALUES($sequence,$id,$time,$json)",("$sequence",ev.Sequence),("$id",entity.EntityId),("$time",ev.ElapsedUs),("$json",Wire.Serialize(sparse)));
                if(prior is null) Write("INSERT OR IGNORE INTO entities VALUES($id,$time,0)",("$id",entity.EntityId),("$time",ev.ElapsedUs));
            }
            entities[entity.EntityId]=sparse with { Position=point ?? prior?.Position };
            if(!entity.Active) {entities.Remove(entity.EntityId);positioned.Remove(entity.EntityId);}
        }
        if(point is not null)
        {
            Positions++;
            if(positioned.Add(point.EntityId)) Write("UPDATE entities SET hasPosition=1 WHERE entityId=$id",("$id",point.EntityId));
            Write("INSERT INTO positions VALUES($sequence,$id,$time,$ordinal,$x,$y,$z,$rx,$ry,$rz,$source,$space,$base,$reason,$account,$playerState,$utc,$continuity)",
                ("$sequence",point.Sequence),("$id",point.EntityId),("$time",point.ElapsedUs),("$ordinal",point.Ordinal),
                ("$x",point.Location.X),("$y",point.Location.Y),("$z",point.Location.Z),("$rx",point.RawLocation.X),("$ry",point.RawLocation.Y),("$rz",point.RawLocation.Z),
                ("$source",point.Source),("$space",point.CoordinateSpace),("$base",point.BaseGuid),("$reason",point.Reason),("$account",point.PlayFabId),("$playerState",point.PlayerStateGuid),("$utc",point.SourceUtc?.UtcTicks),("$continuity",continuity));
        }
        if(player is not null) AppendPlayer(transaction,player with { Sequence=ev.Sequence,ElapsedUs=ev.ElapsedUs });
        if(ev.Kind=="captureGap")
        {
            foreach(var current in players.Values.Where(value=>value.Active))
            foreach(var metric in new[]{"health","stamina"})
                Write("INSERT OR IGNORE INTO metrics VALUES($sequence,$track,$life,$time,$metric,NULL)",("$sequence",ev.Sequence),("$track",current.TrackId),("$life",current.LifetimeId),("$time",ev.ElapsedUs),("$metric",metric));
        }
        if(ev.Kind=="position") return;
        var scopes=Scopes(ev).Concat(player is null?[]:new[]{$"track:{player.TrackId}"}).Distinct().ToArray();
        foreach(var scope in scopes)
        {
            var totalKey=(scope,ev.Kind);
            var prior=totals.GetValueOrDefault(totalKey);
            var amount=ev.Player?.Amount is { } value ? (prior.Amount ?? 0)+value : prior.Amount;
            var next=(Count:prior.Count+ev.Count,Amount:amount);
            totals[totalKey]=next;
            Write("INSERT OR IGNORE INTO totalKinds VALUES($scope,$kind)",("$scope",scope),("$kind",ev.Kind));
            Write("INSERT INTO totalProgress VALUES($sequence,$time,$scope,$kind,$count,$amount)",("$sequence",ev.Sequence),("$time",ev.ElapsedUs),("$scope",scope),("$kind",ev.Kind),("$count",next.Count),("$amount",next.Amount));
        }
        object? Reference(PlayerReference? reference)=>reference is null?null:new object?[]{reference.TrackId,reference.LifetimeId,reference.EntityId,reference.ActorGuid};
        var key=ev.Item is { } item ? Wire.Serialize(new object?[]{"item",continuity,ev.ElapsedUs/1_000_000,ev.Kind,string.IsNullOrWhiteSpace(item.ClassPath)?"Unknown item":item.ClassPath.Trim(),item.Attribution??"unknown",string.IsNullOrEmpty(item.PlayFabId)?new object?[]{"actor",item.OwnerGuid is >0?item.OwnerGuid:null,item.InstigatorGuid is >0?item.InstigatorGuid:null}:new object?[]{"account",item.PlayFabId.ToUpperInvariant()},Reference(ev.Player?.Actor),Reference(ev.Player?.Target),ev.Player?.Contributors?.Select(Reference).OrderBy(Wire.Serialize).ToArray()}) : $"event:{ev.Sequence}";
        foreach(var scope in scopes)
        {
            var groupId=(key,scope);
            var grouped=groups.TryGetValue(groupId,out var prior)?Merge(prior,ev):ev with { GroupKey=key,LastElapsedUs=ev.ElapsedUs,Item=ev.Item is {} first?first with { ClassPath=string.IsNullOrWhiteSpace(first.ClassPath)?"Unknown item":first.ClassPath.Trim() }:null };
            groups[groupId]=grouped;
            Write("INSERT INTO eventGroups VALUES($key,$scope,$sequence,$first,$last,$kind,$search) ON CONFLICT(groupKey,scope) DO UPDATE SET lastUs=excluded.lastUs",
                ("$key",key),("$scope",scope),("$sequence",grouped.Sequence),("$first",grouped.ElapsedUs),("$last",ev.ElapsedUs),("$kind",ev.Kind),("$search",$"{ev.Kind} {ev.Detail} {ev.EntityId} {ev.Item?.ClassPath} {ev.Item?.PlayFabId} {ev.Player?.Actor?.TrackId} {ev.Player?.Target?.TrackId}"));
            Write("INSERT INTO groupProgress VALUES($key,$scope,$sequence,$time,$count,$event)",("$key",key),("$scope",scope),("$sequence",ev.Sequence),("$time",ev.ElapsedUs),("$count",grouped.Count),("$event",Wire.Serialize(grouped)));
        }
        // Item groups cannot grow after their recorded second or a continuity boundary.
        if(groups.Count>4096)
            foreach(var obsolete in groups.Where(pair=>pair.Value.LastElapsedUs<ev.ElapsedUs-1_000_000).Select(pair=>pair.Key).ToArray()) groups.Remove(obsolete);
    }

    private void AppendPlayer(SqliteTransaction transaction,PlayerStateSnapshot player)
    {
        var hadPrior=players.TryGetValue(player.LifetimeId,out var prior);
        var normalized=player with { ElapsedUs=0,Sequence=0,Source=null };
        if(hadPrior && Wire.Serialize(prior! with { ElapsedUs=0,Sequence=0,Source=null })==Wire.Serialize(normalized)) return;
        void Write(string sql,params (string Name,object? Value)[] values)=>commands.Execute(transaction,sql,values);
        Write("INSERT INTO players VALUES($life,$track,$entity,$time,$sequence) ON CONFLICT(lifetimeId) DO UPDATE SET trackId=excluded.trackId",("$life",player.LifetimeId),("$track",player.TrackId),("$entity",player.EntityId),("$time",player.ElapsedUs),("$sequence",player.Sequence));
        Write("INSERT INTO playerStates VALUES($sequence,$life,$time,$json)",("$sequence",player.Sequence),("$life",player.LifetimeId),("$time",player.ElapsedUs),("$json",Wire.Serialize(player)));
        Write("INSERT OR IGNORE INTO playerTracks VALUES($track)",("$track",player.TrackId));
        Write("INSERT INTO playerTotals VALUES($track,$sequence,$time,$dealt,$received,$kills,$deaths)",("$track",player.TrackId),("$sequence",player.Sequence),("$time",player.ElapsedUs),("$dealt",player.DamageDealt),("$received",player.DamageReceived),("$kills",player.Kills),("$deaths",player.Deaths));
        foreach(var alias in player.Aliases??[])
            Write("INSERT OR IGNORE INTO playerTotals VALUES($track,$sequence,$time,NULL,NULL,NULL,NULL)",("$track",alias),("$sequence",player.Sequence),("$time",player.ElapsedUs));
        players[player.LifetimeId]=player;
        if(player.Direction=="fromServer") knownTracks.Add(player.TrackId);
        foreach(var alias in player.Aliases??[]) {knownTracks.Remove(alias);aliases[alias]=player.TrackId;}
        if(!hadPrior || prior!.Active!=player.Active || prior.TrackId!=player.TrackId || !(prior.Aliases??[]).SequenceEqual(player.Aliases??[]))
        {
            if(player.Active) active.Add(player.LifetimeId); else active.Remove(player.LifetimeId);
            Write("INSERT INTO membership VALUES($sequence,$time,$life,$active)",("$sequence",player.Sequence),("$time",player.ElapsedUs),("$life",player.LifetimeId),("$active",player.Active));
            if(++membershipChanges%128==0) Write("INSERT INTO rosterCheckpoints VALUES($sequence,$time,$json)",("$sequence",player.Sequence),("$time",player.ElapsedUs),("$json",Wire.Serialize(active)));
            string Canonical(string track)
            {
                for(var step=0;step<64 && aliases.TryGetValue(track,out var target) && target!=track;step++) track=target;
                return track;
            }
            var activeCount=players.Values.Where(value=>value.Active&&value.Direction=="fromServer").Select(value=>Canonical(value.TrackId)).Distinct().Count();
            Write("INSERT INTO rosterProgress VALUES($sequence,$time,$active,$known)",("$sequence",player.Sequence),("$time",player.ElapsedUs),("$active",activeCount),("$known",knownTracks.Count));
        }
        foreach(var metric in new[]{("health",player.Health,prior?.Health),("stamina",player.Stamina,prior?.Stamina)})
        {
            if(hadPrior && prior!.TrackId!=player.TrackId)
                Write("INSERT INTO metrics VALUES($sequence,$track,$life,$time,$metric,NULL)",("$sequence",player.Sequence),("$track",prior.TrackId),("$life",player.LifetimeId),("$time",player.ElapsedUs),("$metric",metric.Item1));
            if(!hadPrior || prior!.TrackId!=player.TrackId || metric.Item2!=metric.Item3 || !player.Active)
                Write("INSERT INTO metrics VALUES($sequence,$track,$life,$time,$metric,$value)",("$sequence",player.Sequence),("$track",player.TrackId),("$life",player.LifetimeId),("$time",player.ElapsedUs),("$metric",metric.Item1),("$value",player.Active?metric.Item2:null));
        }
        if(!player.Active) players.Remove(player.LifetimeId);
    }

    public static IEnumerable<string> Scopes(TelemetryEvent ev)
    {
        yield return "";
        if(ev.EntityId is not null) yield return $"entity:{ev.EntityId}";
        var references=new[]{ev.Player?.Actor,ev.Player?.Target}.Concat(ev.Player?.Contributors ?? []);
        foreach(var track in references.Select(reference=>reference?.TrackId).Where(track=>track is not null).Distinct())
            yield return $"track:{track}";
    }

    internal static TelemetryEvent Merge(TelemetryEvent prior,TelemetryEvent next)
    {
        var item=prior.Item!;
        var incoming=next.Item!;
        var multiple=item.ActorGuid==0 || item.ActorGuid!=incoming.ActorGuid || prior.EntityId!=next.EntityId;
        return prior with {
            Count=prior.Count+next.Count,LastElapsedUs=next.ElapsedUs,
            EntityId=prior.EntityId==next.EntityId?prior.EntityId:null,
            Item=item with {
                ActorGuid=multiple?0:item.ActorGuid,Location=multiple?null:item.Location,SpawnLocationPresent=multiple?null:item.SpawnLocationPresent,
                OwnerGuid=item.OwnerGuid==incoming.OwnerGuid?item.OwnerGuid:null,
                InstigatorGuid=item.InstigatorGuid==incoming.InstigatorGuid?item.InstigatorGuid:null,
                CloseReason=item.CloseReason==incoming.CloseReason?item.CloseReason:null
            }
        };
    }
}
