using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace SpellBook.Telemetry;
public static class StateProjector
{
    public const int MaxEntities = 512;
    public static IReadOnlyList<TelemetryEntity> ReadProjection(SqliteConnection connection,SqliteTransaction tx,ReadView view,IReadOnlyList<TelemetryEntity>? live,CancellationToken ct)
    {
        var entities=new List<TelemetryEntity>();
        using var typed=connection.CreateCommand();typed.Transaction=tx;
        typed.CommandText="SELECT 1 FROM players WHERE firstUs<=$time AND firstSequence<=$head LIMIT 1";ReadViews.Bind(typed,view);
        var hasPlayers=typed.ExecuteScalar() is not null;
        var active=hasPlayers?PlayerQueryReader.Active(connection,tx,view):null;
        if(live is not null) entities.AddRange(live.Where(entity=>!hasPlayers || entity.Active && entity.Kind=="pawn").OrderByDescending(entity=>entity.Active).ThenByDescending(entity=>entity.Position?.ElapsedUs??0).Take(MaxEntities));
        else
        {
            using var command=connection.CreateCommand(); command.Transaction=tx;
            ReadViews.Bind(command,view);
            var membership="";
            if(active is not null)
            {
                if(active.Count==0) return [];
                var parameters=active.Select((id,index)=>{var name=$"$life{index}";command.Parameters.AddWithValue(name,id);return name;});
                membership=$" AND e.entityId IN (SELECT entityId FROM players WHERE lifetimeId IN ({string.Join(',',parameters)}))";
            }
            command.CommandText=$"""
                WITH latest AS MATERIALIZED (
                    SELECT (SELECT json FROM entityStates s WHERE s.entityId=e.entityId AND s.elapsedUs<=$time AND s.sequence<=$head ORDER BY s.elapsedUs DESC,s.sequence DESC LIMIT 1) AS json
                    FROM entities e WHERE e.firstUs<=$time AND e.hasPosition=1 {membership})
                SELECT json FROM latest WHERE json IS NOT NULL ORDER BY json_extract(json,'$.active') DESC LIMIT 512
                """;
            using(var cancel=ct.Register(command.Cancel))
            using(var rows=command.ExecuteReader())
                while(rows.Read()) {ct.ThrowIfCancellationRequested(); entities.Add(JsonSerializer.Deserialize<TelemetryEntity>(rows.GetString(0),Wire.Json)!);}
            command.Parameters.AddWithValue("$id","");
            command.CommandText=$"SELECT {PositionReader.Columns} FROM positions WHERE entityId=$id AND elapsedUs<=$time AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1";
            command.Prepare();
            for(var i=0;i<entities.Count;i++)
            {
                command.Parameters["$id"].Value=entities[i].EntityId;
                using var row=command.ExecuteReader();
                if(row.Read()) entities[i]=entities[i] with {Position=PositionReader.Read(row)};
            }
        }
        var names=Names(connection,tx);
        return entities.Where(entity=>entity.Position is not null || entity.Kind=="pawn").Select(entity=>entity.PlayFabId is not null && names.TryGetValue(entity.PlayFabId,out var name)?entity with {Name=name.Name,NameObservedAtUtc=name.ObservedAtUtc}:entity).ToArray();
    }
    public static IReadOnlyList<PlayerStateSnapshot> LabelPlayers(SqliteConnection connection,SqliteTransaction tx,IReadOnlyList<PlayerStateSnapshot> players)
    {
        var names=Names(connection,tx);
        return players.Select(player=>player.PlayFabId is not null && names.TryGetValue(player.PlayFabId,out var name)?player with {Name=name.Name}:player).ToArray();
    }
    private static Dictionary<string,NameObservation> Names(SqliteConnection connection,SqliteTransaction tx)
    {
        using var command=connection.CreateCommand(); command.Transaction=tx; command.CommandText="SELECT playFabId,json FROM names";
        using var rows=command.ExecuteReader();
        var names=new Dictionary<string,NameObservation>(StringComparer.OrdinalIgnoreCase);
        while(rows.Read()) names[rows.GetString(0)]=JsonSerializer.Deserialize<NameObservation>(rows.GetString(1),Wire.Json)!;
        return names;
    }
    public static IReadOnlyList<TelemetryEntity> Read(SqliteConnection c, SqliteTransaction tx, long atUs, CancellationToken ct)
    {
        using var command = c.CreateCommand(); command.Transaction = tx;
        command.CommandText = """
            WITH snapshots AS MATERIALIZED (
                SELECT (SELECT entity FROM records r WHERE r.entityId=e.entityId AND r.elapsedUs<=$time AND r.entity IS NOT NULL ORDER BY r.elapsedUs DESC,r.sequence DESC LIMIT 1) AS snapshot,e.firstUs
                FROM entities e WHERE e.firstUs<=$time AND e.hasPosition=1
            )
            SELECT snapshot FROM snapshots WHERE snapshot IS NOT NULL
            ORDER BY json_extract(snapshot,'$.active') DESC,COALESCE(json_extract(snapshot,'$.position.elapsedUs'),firstUs) DESC LIMIT 512
            """;
        command.Parameters.AddWithValue("$time",atUs);
        using var cancel = ct.Register(command.Cancel);
        using var reader = command.ExecuteReader();
        var entities = new List<TelemetryEntity>();
        while (reader.Read())
        {
            ct.ThrowIfCancellationRequested();
            if (reader.IsDBNull(0)) continue;
            var entity = JsonSerializer.Deserialize<TelemetryEntity>(reader.GetString(0), Wire.Json)!;
            if (entity.Position is not null || entity.Kind == "pawn") entities.Add(entity);
        }
        reader.Close();
        using var names = c.CreateCommand(); names.Transaction = tx; names.CommandText = "SELECT playFabId,json FROM names";
        using var nameReader = names.ExecuteReader(); var labels = new Dictionary<string,NameObservation>();
        while (nameReader.Read()) labels[nameReader.GetString(0)] = JsonSerializer.Deserialize<NameObservation>(nameReader.GetString(1),Wire.Json)!;
        var result=new List<TelemetryEntity>(); var remaining=Wire.MaxBytes-4096;
        foreach(var entity in entities)
        {
            var labeled=entity.PlayFabId is not null && labels.TryGetValue(entity.PlayFabId,out var name) ? entity with { Name = name.Name, NameObservedAtUtc = name.ObservedAtUtc } : entity;
            var size=System.Text.Encoding.UTF8.GetByteCount(Wire.Serialize(labeled))+1;
            if(size>remaining) break;
            result.Add(labeled);remaining-=size;
        }
        return result;
    }
}
