using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace SpellBook.Telemetry;

public static class ProjectedEventQuery
{
    public static EventPage Read(SqliteConnection connection,SqliteTransaction tx,RecordingStatus status,EventQuery query,CancellationToken ct)
    {
        var view=ReadViews.Resolve(status,query.ToUs,query.ReadView);
        if(query.TrackId is not null)
        {
            var track=TrackScope.Resolve(connection,tx,view,query.TrackId);
            if(track.Tracks.Count>1) return AliasEventQuery.Read(connection,tx,status,query,view,track,ct);
            query=query with {TrackId=track.Canonical};
        }
        using var command=connection.CreateCommand();command.Transaction=tx;
        ReadViews.Bind(command,view);
        command.Parameters.AddWithValue("$from",query.FromUs);
        command.Parameters.AddWithValue("$to",Math.Min(query.ToUs,view.AtUs));
        command.Parameters.AddWithValue("$scope",query.TrackId is not null?$"track:{query.TrackId}":query.EntityId is not null?$"entity:{query.EntityId}":"");
        command.Parameters.AddWithValue("$after",query.AfterSequence);
        command.Parameters.AddWithValue("$offset",query.Offset);
        command.Parameters.AddWithValue("$limit",query.Limit+1);
        var filter="g.scope=$scope AND g.firstUs<=$to AND g.sequence<=$head";
        if(query.Search is {Length:>0})
        {
            filter+=" AND g.search LIKE $search ESCAPE '\\'";
            command.Parameters.AddWithValue("$search",$"%{query.Search.Replace("\\","\\\\").Replace("%","\\%").Replace("_","\\_")}%");
        }
        string[] kindNames=[];
        if(query.Kinds is {Length:>0})
        {
            kindNames=query.Kinds.Distinct().Select((kind,index)=>{
                var name=$"$kind{index}";command.Parameters.AddWithValue(name,kind);return name;
            }).ToArray();
        }
        var kindsFilter=kindNames.Length==0?"":$" AND g.kind IN ({string.Join(',',kindNames)})";
        if(query.FromUs>0)
            filter+=" AND g.lastUs>=$from AND (g.firstUs>=$from OR EXISTS(SELECT 1 FROM groupProgress p WHERE p.groupKey=g.groupKey AND p.scope=g.scope AND p.elapsedUs BETWEEN $from AND $to AND p.sequence<=$head))";
        var anchor=query.FromUs==0?"g.sequence":"(SELECT sequence FROM groupProgress p WHERE p.groupKey=g.groupKey AND p.scope=g.scope AND p.elapsedUs BETWEEN $from AND $to AND p.sequence<=$head ORDER BY elapsedUs,sequence LIMIT 1)";
        var page=query.NewestFirst?$"($after=0 OR {anchor}<$after)":$"{anchor}>$after";
        var order=query.NewestFirst?$"{anchor} DESC":$"{anchor}";
        // Unary plus keeps the head count on the smaller sequence index.
        var headCountFilter=query.FromUs==0?filter.Replace("g.firstUs<=$to","+g.firstUs<=$to"):filter;
        command.CommandText=kindNames.Length==0?$"SELECT COUNT(*) FROM eventGroups g WHERE {filter}":
            $"SELECT SUM(count) FROM ({string.Join(" UNION ALL ",kindNames.Select(kind=>$"SELECT COUNT(*) AS count FROM eventGroups g WHERE {headCountFilter} AND g.kind={kind}"))})";
        using var countCancel=ct.Register(command.Cancel);
        long total=0;
        var kindHeads=new Dictionary<string,string>();
        if(query.GroupItems && query.FromUs==0 && kindNames.Length>0 && (view.AtUs<status.Head.ElapsedUs || query.Search is {Length:>0}))
        {
            // Count from the time index, then bound each page to its latest matching group.
            var countFilter=filter.Replace("g.sequence<=$head","+g.sequence<=$head");
            command.CommandText=string.Join(" UNION ALL ",kindNames.Select((kind,index)=>$"SELECT {index},COUNT(*),MAX(g.sequence) FROM eventGroups g WHERE {countFilter} AND g.kind={kind}"));
            var heads=new List<(int Index,long Head)>();
            using(var counts=command.ExecuteReader())
                while(counts.Read()) {total+=counts.GetInt64(1); heads.Add((counts.GetInt32(0),counts.IsDBNull(2)?0:counts.GetInt64(2)));}
            foreach(var (index,head) in heads)
            {
                var name=$"$kindHead{index}";
                command.Parameters.AddWithValue(name,head);
                kindHeads[kindNames[index]]=name;
            }
        }
        else if(query.GroupItems) total=(long)command.ExecuteScalar()!;
        if(query.GroupItems && total==0) return new(status.Id,status.Revision,[],null,new(view.ThroughSequence,view.AtUs),view,0,null);
        var selected=$"SELECT g.groupKey,g.scope FROM eventGroups g WHERE {filter}{kindsFilter} AND {page} ORDER BY {order} LIMIT $limit OFFSET $offset";
        if(query.FromUs==0 && kindNames.Length>0)
        {
            command.Parameters.AddWithValue("$candidates",(long)query.Offset+query.Limit+1);
            var candidates=kindNames.Select(kind=>{
                var candidateFilter=kindHeads.TryGetValue(kind,out var head)?filter.Replace("g.sequence<=$head",$"g.sequence<={head}"):filter;
                return $"SELECT * FROM (SELECT g.groupKey,g.scope,g.sequence FROM eventGroups g WHERE {candidateFilter} AND g.kind={kind} AND {page} ORDER BY {order} LIMIT $candidates)";
            });
            selected=$"SELECT groupKey,scope FROM ({string.Join(" UNION ALL ",candidates)}) ORDER BY sequence {(query.NewestFirst?"DESC":"ASC")} LIMIT $limit OFFSET $offset";
        }
        if(query.GroupItems)
            command.CommandText=$"""
                WITH selected AS MATERIALIZED (
                    {selected}
                ), bounds AS (
                    SELECT g.groupKey,g.scope,
                        (SELECT sequence FROM groupProgress WHERE groupKey=g.groupKey AND scope=g.scope AND elapsedUs BETWEEN $from AND $to AND sequence<=$head ORDER BY elapsedUs,sequence LIMIT 1) AS firstSequence,
                        (SELECT sequence FROM groupProgress WHERE groupKey=g.groupKey AND scope=g.scope AND elapsedUs BETWEEN $from AND $to AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1) AS lastSequence,
                        (SELECT count FROM groupProgress WHERE groupKey=g.groupKey AND scope=g.scope AND elapsedUs<$from AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1) AS priorCount
                    FROM selected g)
                SELECT last.event,first.event,first.elapsedUs,last.elapsedUs,last.count-COALESCE(b.priorCount,0),first.sequence
                FROM bounds b
                JOIN groupProgress first ON first.groupKey=b.groupKey AND first.scope=b.scope AND first.sequence=b.firstSequence
                JOIN groupProgress last ON last.groupKey=b.groupKey AND last.scope=b.scope AND last.sequence=b.lastSequence
                ORDER BY first.sequence {(query.NewestFirst?"DESC":"ASC")}
                """;
        else
            command.CommandText=$"""
                SELECT r.event,r.event,r.elapsedUs,r.elapsedUs,1,r.sequence,COUNT(*) OVER()
                FROM eventGroups g JOIN groupProgress p ON p.groupKey=g.groupKey AND p.scope=g.scope JOIN records r ON r.sequence=p.sequence
                WHERE {filter}{kindsFilter} AND r.elapsedUs BETWEEN $from AND $to AND r.sequence<=$head AND {(query.NewestFirst?"($after=0 OR r.sequence<$after)":"r.sequence>$after")}
                ORDER BY r.sequence {(query.NewestFirst?"DESC":"ASC")} LIMIT $limit OFFSET $offset
                """;
        using var cancel=ct.Register(command.Cancel);
        var events=new List<TelemetryEvent>();
        using(var rows=command.ExecuteReader())
            while(rows.Read())
            {
                ct.ThrowIfCancellationRequested();
                var count=rows.GetInt64(4);
                var ev=JsonSerializer.Deserialize<TelemetryEvent>(rows.GetString(count==1?1:0),Wire.Json)!;
                if(count==1 && query.GroupItems)
                {
                    using var raw=connection.CreateCommand(); raw.Transaction=tx;raw.CommandText="SELECT event FROM records WHERE sequence=$sequence";raw.Parameters.AddWithValue("$sequence",rows.GetInt64(5));
                    ev=JsonSerializer.Deserialize<TelemetryEvent>((string)raw.ExecuteScalar()!,Wire.Json)! with {GroupKey=ev.GroupKey};
                }
                events.Add(ev with {Sequence=rows.GetInt64(5),ElapsedUs=rows.GetInt64(2),LastElapsedUs=rows.GetInt64(3),Count=count,Detail=count>1?$"{count} activities in this recorded second; individual evidence retained":ev.Detail});
                if(!query.GroupItems) total=rows.GetInt64(6);
            }
        var more=events.Count>query.Limit;
        if(more) events.RemoveAt(events.Count-1);
        var lean=ResponseBudget.Take(events.Select(ResponseBudget.Lean).ToArray());
        more|=lean.Count<events.Count;
        return new(status.Id,status.Revision,lean,more?lean[^1].Sequence:null,new(view.ThroughSequence,view.AtUs),view,total,more?query.Offset+lean.Count:null);
    }
}
