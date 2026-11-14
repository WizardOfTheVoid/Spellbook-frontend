using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace SpellBook.Telemetry;

public static class AliasEventQuery
{
    public static EventPage Read(SqliteConnection connection,SqliteTransaction tx,RecordingStatus status,EventQuery query,ReadView view,TrackScope scope,CancellationToken ct)
    {
        using var command=connection.CreateCommand();command.Transaction=tx;
        ReadViews.Bind(command,view);
        var scopes=scope.Bind(command,scopes:true);
        command.Parameters.AddWithValue("$from",query.FromUs);command.Parameters.AddWithValue("$to",Math.Min(query.ToUs,view.AtUs));
        command.Parameters.AddWithValue("$after",query.AfterSequence);command.Parameters.AddWithValue("$offset",query.Offset);command.Parameters.AddWithValue("$limit",query.Limit+1);
        var filter=$"g.scope IN ({scopes}) AND g.firstUs<=$to AND g.lastUs>=$from AND g.sequence<=$head";
        if(query.Search is {Length:>0})
        {
            filter+=" AND g.search LIKE $search ESCAPE '\\'";
            command.Parameters.AddWithValue("$search",$"%{query.Search.Replace("\\","\\\\").Replace("%","\\%").Replace("_","\\_")}%");
        }
        if(query.Kinds is {Length:>0})
        {
            var parameters=query.Kinds.Select((kind,index)=>{var key=$"$kind{index}";command.Parameters.AddWithValue(key,kind);return key;});
            filter+=$" AND g.kind IN ({string.Join(',',parameters)})";
        }
        var matching=$"""
            SELECT g.groupKey,MIN(p.sequence) AS sequence FROM eventGroups g JOIN groupProgress p ON p.groupKey=g.groupKey AND p.scope=g.scope
            WHERE {filter} AND p.elapsedUs BETWEEN $from AND $to AND p.sequence<=$head GROUP BY g.groupKey
            """;
        if(!query.GroupItems) matching=$"""
            SELECT CAST(p.sequence AS TEXT) AS groupKey,p.sequence FROM eventGroups g JOIN groupProgress p ON p.groupKey=g.groupKey AND p.scope=g.scope
            WHERE {filter} AND p.elapsedUs BETWEEN $from AND $to AND p.sequence<=$head GROUP BY p.sequence
            """;
        command.CommandText=$"SELECT COUNT(*) FROM ({matching})";
        using var cancel=ct.Register(command.Cancel);
        var total=(long)command.ExecuteScalar()!;
        var page=query.NewestFirst?"($after=0 OR sequence<$after)":"sequence>$after";
        var order=query.NewestFirst?"DESC":"ASC";
        command.CommandText=$"""
            WITH matching AS ({matching}),selected AS MATERIALIZED(SELECT * FROM matching WHERE {page} ORDER BY sequence {order} LIMIT $limit OFFSET $offset)
            SELECT selected.groupKey,r.event FROM selected JOIN groupProgress p ON {(query.GroupItems?"p.groupKey=selected.groupKey":"p.sequence=selected.sequence")}
            JOIN records r ON r.sequence=p.sequence WHERE p.scope IN ({scopes}) AND p.elapsedUs BETWEEN $from AND $to AND p.sequence<=$head GROUP BY selected.groupKey,p.sequence ORDER BY p.sequence
            """;
        var groups=new Dictionary<string,TelemetryEvent>();
        using(var rows=command.ExecuteReader())
            while(rows.Read())
            {
                ct.ThrowIfCancellationRequested();
                var key=rows.GetString(0);var ev=JsonSerializer.Deserialize<TelemetryEvent>(rows.GetString(1),Wire.Json)!;
                groups[key]=groups.TryGetValue(key,out var prior)?ProjectionWriter.Merge(prior,ev):ev with {GroupKey=query.GroupItems?key:null,LastElapsedUs=ev.ElapsedUs};
            }
        var events=(query.NewestFirst?groups.Values.OrderByDescending(ev=>ev.Sequence):groups.Values.OrderBy(ev=>ev.Sequence)).ToList();
        var more=events.Count>query.Limit;if(more) events.RemoveAt(events.Count-1);
        events=events.Select(ev=>ev.Count>1?ev with {Detail=$"{ev.Count} activities in this recorded second; individual evidence retained"}:ev).ToList();
        var lean=ResponseBudget.Take(events.Select(ResponseBudget.Lean).ToArray());more|=lean.Count<events.Count;
        return new(status.Id,status.Revision,lean,more?lean[^1].Sequence:null,new(view.ThroughSequence,view.AtUs),view,total,more?query.Offset+lean.Count:null);
    }
}
