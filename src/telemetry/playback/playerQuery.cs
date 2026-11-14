using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace SpellBook.Telemetry;

public static class PlayerQueryReader
{
    public static PlayerPage Read(string root,PlayerQuery query,CancellationToken ct)
    {
        if(query.AtUs<0 || query.Offset<0 || query.Limit is <1 or >200 || query.LifetimeId?.Length>256) throw new ArgumentException("Invalid player query");
        using var connection=RecordingDatabase.Open(root,true);
        using var tx=connection.BeginTransaction();
        var status=TimelineQuery.Status(connection,tx);
        var view=ReadViews.Resolve(status,query.AtUs,query.ReadView);
        if(!RecordingDatabase.HasProjection(connection)) return new(status.Id,status.Revision,[],null,view);
        var players=Read(connection,tx,view,query.LifetimeId,query.IncludeDeparted,query.Offset,query.Limit+1,ct);
        var more=players.Count>query.Limit;
        var lean=ResponseBudget.Take(players.Take(query.Limit).Select(ResponseBudget.Lean).ToArray());more|=lean.Count<Math.Min(query.Limit,players.Count);
        return new(status.Id,status.Revision,lean,more?query.Offset+lean.Count:null,view);
    }

    public static IReadOnlyList<PlayerStateSnapshot> Read(SqliteConnection connection,SqliteTransaction tx,ReadView view,string? lifetimeId,bool includeDeparted,int offset,int limit,CancellationToken ct,IReadOnlyList<string>? tracks=null)
    {
        if(includeDeparted && lifetimeId is null) return PlayerCatalog.Read(connection,tx,view,offset,limit,ct);
        var active=includeDeparted?null:Active(connection,tx,view);
        if(active?.Count==0) return [];
        using var command=connection.CreateCommand();
        command.Transaction=tx;
        ReadViews.Bind(command,view);
        var filter="p.firstUs<=$time AND p.firstSequence<=$head";
        if(lifetimeId is not null)
        {
            filter+=" AND p.lifetimeId=$life";
            command.Parameters.AddWithValue("$life",lifetimeId);
        }
        if(active is not null)
        {
            var names=active.Select((id,index)=>{
                var name=$"$active{index}";
                command.Parameters.AddWithValue(name,id);
                return name;
            });
            filter+=$" AND p.lifetimeId IN ({string.Join(',',names)})";
        }
        if(tracks is not null)
        {
            var names=tracks.Select((track,index)=>{
                var name=$"$track{index}";
                command.Parameters.AddWithValue(name,track);
                return name;
            });
            filter+=$" AND json_extract(s.json,'$.trackId') IN ({string.Join(',',names)})";
        }
        var selection=tracks is null?"s.json":"s.json,p.firstUs,p.lifetimeId,ROW_NUMBER() OVER(PARTITION BY json_extract(s.json,'$.trackId') ORDER BY (COALESCE(json_extract(s.json,'$.observationKind'),'pawn')='pawn') DESC,(json_extract(s.json,'$.direction')='fromServer') DESC,s.sequence DESC) AS rank";
        var source=$"""
            SELECT {selection} FROM players p JOIN playerStates s ON s.sequence=(
                SELECT sequence FROM playerStates WHERE lifetimeId=p.lifetimeId AND elapsedUs<=$time AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1)
            WHERE {filter}
            """;
        command.CommandText=tracks is null?$"{source} ORDER BY p.firstUs DESC,p.lifetimeId LIMIT $limit OFFSET $offset"
            :$"SELECT json FROM ({source}) WHERE rank=1 ORDER BY firstUs DESC,lifetimeId LIMIT $limit OFFSET $offset";
        command.Parameters.AddWithValue("$limit",limit); command.Parameters.AddWithValue("$offset",offset);
        using var cancel=ct.Register(command.Cancel);
        using var reader=command.ExecuteReader();
        var result=new List<PlayerStateSnapshot>();
        while(reader.Read()) { ct.ThrowIfCancellationRequested(); result.Add(JsonSerializer.Deserialize<PlayerStateSnapshot>(reader.GetString(0),Wire.Json)!); }
        return result;
    }

    public static HashSet<string> Active(SqliteConnection connection,SqliteTransaction tx,ReadView view)
    {
        using var checkpoint=connection.CreateCommand();
        checkpoint.Transaction=tx; ReadViews.Bind(checkpoint,view);
        checkpoint.CommandText="SELECT sequence,json FROM rosterCheckpoints WHERE elapsedUs<=$time AND sequence<=$head ORDER BY sequence DESC LIMIT 1";
        long sequence=0;
        var active=new HashSet<string>();
        using(var reader=checkpoint.ExecuteReader())
            if(reader.Read()) {sequence=reader.GetInt64(0); active=JsonSerializer.Deserialize<HashSet<string>>(reader.GetString(1),Wire.Json)!;}
        using var changes=connection.CreateCommand();
        changes.Transaction=tx; ReadViews.Bind(changes,view);
        changes.CommandText="SELECT lifetimeId,active FROM membership WHERE sequence>$after AND sequence<=$head AND elapsedUs<=$time ORDER BY sequence";
        changes.Parameters.AddWithValue("$after",sequence);
        using var rows=changes.ExecuteReader();
        while(rows.Read()) {if(rows.GetBoolean(1)) active.Add(rows.GetString(0)); else active.Remove(rows.GetString(0));}
        return active;
    }
}
