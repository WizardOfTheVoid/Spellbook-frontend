using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace SpellBook.Telemetry;

public static class PlayerCatalog
{
    public static IReadOnlyList<PlayerStateSnapshot> Read(SqliteConnection connection,SqliteTransaction tx,ReadView view,int offset,int limit,CancellationToken ct)
    {
        using var command=connection.CreateCommand();
        command.Transaction=tx;ReadViews.Bind(command,view);
        command.CommandText="""
            SELECT s.json FROM playerTracks t
            CROSS JOIN playerTotals total ON total.trackId=t.trackId AND total.sequence=(
                SELECT sequence FROM playerTotals WHERE trackId=t.trackId AND elapsedUs<=$time AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1)
            CROSS JOIN playerStates s ON s.sequence=total.sequence
            CROSS JOIN players p ON p.lifetimeId=s.lifetimeId
            WHERE json_extract(s.json,'$.trackId')=t.trackId
            ORDER BY p.firstUs DESC,t.trackId LIMIT $limit OFFSET $offset
            """;
        command.Parameters.AddWithValue("$limit",limit);command.Parameters.AddWithValue("$offset",offset);
        using var cancel=ct.Register(command.Cancel);
        var result=new List<PlayerStateSnapshot>();
        using(var reader=command.ExecuteReader())
            while(reader.Read()) {ct.ThrowIfCancellationRequested();result.Add(JsonSerializer.Deserialize<PlayerStateSnapshot>(reader.GetString(0),Wire.Json)!);}
        if(result.Count==0) return result;
        // A delayed close from an older lifetime must not hide a still-active context.
        var active=PlayerQueryReader.Read(connection,tx,view,null,false,0,512,ct,result.Select(player=>player.TrackId).ToArray())
            .GroupBy(player=>player.TrackId)
            .ToDictionary(group=>group.Key,group=>group.OrderByDescending(player=>player.ObservationKind=="pawn")
                .ThenByDescending(player=>player.Direction=="fromServer").ThenByDescending(player=>player.Sequence).First());
        return result.Select(player=>active.TryGetValue(player.TrackId,out var current)?current:player with {Active=false}).ToArray();
    }

    public static PlayerStateSnapshot? Latest(SqliteConnection connection,SqliteTransaction tx,ReadView view,string track)
    {
        using var command=connection.CreateCommand();
        command.Transaction=tx;ReadViews.Bind(command,view);
        command.CommandText="""
            SELECT json FROM playerStates WHERE sequence=(
                SELECT sequence FROM playerTotals WHERE trackId=$track AND elapsedUs<=$time AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1)
            """;
        var parameter=command.Parameters.AddWithValue("$track",track);
        PlayerStateSnapshot? found=null;
        var visited=new HashSet<string>();
        while(visited.Count<64 && visited.Add(track))
        {
            parameter.Value=track;
            if(command.ExecuteScalar() is not string json) break;
            found=JsonSerializer.Deserialize<PlayerStateSnapshot>(json,Wire.Json)!;
            if(found.TrackId==track) break;
            track=found.TrackId;
        }
        return found;
    }
}
