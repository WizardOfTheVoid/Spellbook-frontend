using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace SpellBook.Telemetry;
public static class TimelineQuery
{
    public static RecordingStatus Status(SqliteConnection c, SqliteTransaction tx)
    {
        using var cmd = c.CreateCommand(); cmd.Transaction = tx; cmd.CommandText = "SELECT json FROM state WHERE id=1";
        return JsonSerializer.Deserialize<RecordingStatus>((string)(cmd.ExecuteScalar() ?? throw new InvalidOperationException("No committed recording")), Wire.Json)!;
    }
    public static EventPage Events(string root, EventQuery query, CancellationToken ct)
    {
        if (query.FromUs < 0 || query.ToUs < query.FromUs || query.AfterSequence < 0 || query.Limit is < 1 or > 200 || query.Kinds?.Length > 32 || query.Offset<0 || query.Search?.Length>128) throw new ArgumentException("Invalid event query");
        ct.ThrowIfCancellationRequested();
        using var c = RecordingDatabase.Open(root,true); using var tx = c.BeginTransaction();
        var status = Status(c,tx);
        var view=ReadViews.Resolve(status,query.ToUs,query.ReadView);
        if(RecordingDatabase.HasProjection(c)) return ProjectedEventQuery.Read(c,tx,status,query,ct);
        using var cmd = c.CreateCommand(); cmd.Transaction = tx;
        var filter = "r.kind<>'position' AND r.elapsedUs BETWEEN $from AND $to AND r.sequence<=$head";
        cmd.Parameters.AddWithValue("$from",query.FromUs); cmd.Parameters.AddWithValue("$to",Math.Min(query.ToUs,view.AtUs)); cmd.Parameters.AddWithValue("$after",query.AfterSequence); cmd.Parameters.AddWithValue("$head",view.ThroughSequence);
        if (query.EntityId is not null) { filter += " AND r.entityId=$id"; cmd.Parameters.AddWithValue("$id",query.EntityId); }
        if(query.TrackId is not null)
        {
            filter+=" AND (json_extract(r.event,'$.player.actor.trackId')=$track OR json_extract(r.event,'$.player.target.trackId')=$track OR EXISTS(SELECT 1 FROM json_each(r.event,'$.player.contributors') p WHERE json_extract(p.value,'$.trackId')=$track))";
            cmd.Parameters.AddWithValue("$track",query.TrackId);
        }
        if(query.Search is {Length:>0})
        {
            filter+=" AND (r.kind||' '||COALESCE(r.entityId,'')||' '||COALESCE(json_extract(r.event,'$.detail'),'')||' '||COALESCE(json_extract(r.event,'$.item.classPath'),'')) LIKE $search ESCAPE '\\'";
            cmd.Parameters.AddWithValue("$search",$"%{query.Search.Replace("\\","\\\\").Replace("%","\\%").Replace("_","\\_")}%");
        }
        if (query.Kinds is { Length: > 0 })
        {
            var names = query.Kinds.Select((kind,i) => { var key = $"$kind{i}"; cmd.Parameters.AddWithValue(key,kind); return key; });
            filter += $" AND r.kind IN ({string.Join(',',names)})";
        }
        var page = query.NewestFirst ? "($after=0 OR g.sequence<$after)" : "g.sequence>$after";
        var order = query.NewestFirst ? "g.sequence DESC" : "g.elapsedUs,g.sequence";
        using var index = c.CreateCommand(); index.Transaction = tx; index.CommandText = "SELECT 1 FROM sqlite_master WHERE type='table' AND name='itemActivities'";
        cmd.CommandText = query.GroupItems ? ItemEventQuery.Sql(filter,page,order,index.ExecuteScalar() is not null)
            : $"SELECT r.event,COUNT(*) OVER() FROM records r WHERE {filter} AND {page.Replace("g.","r.")} ORDER BY {order.Replace("g.","r.")} LIMIT $limit OFFSET $offset";
        cmd.Parameters.AddWithValue("$limit",query.Limit + 1);
        cmd.Parameters.AddWithValue("$offset",query.Offset);
        using var cancel = ct.Register(cmd.Cancel);
        var events = new List<TelemetryEvent>();
        long matching=0;
        try
        {
            using var reader = cmd.ExecuteReader();
            while (reader.Read())
            {
                ct.ThrowIfCancellationRequested();
                events.Add(query.GroupItems ? ItemEventQuery.Read(reader) : JsonSerializer.Deserialize<TelemetryEvent>(reader.GetString(0),Wire.Json)!);
                matching=reader.GetInt64(query.GroupItems?11:1);
            }
        }
        catch (SqliteException) when (ct.IsCancellationRequested) { throw new OperationCanceledException(ct); }
        var more = events.Count > query.Limit; if (more) events.RemoveAt(events.Count - 1);
        var lean=ResponseBudget.Take(events.Select(ResponseBudget.Lean).ToArray());more|=lean.Count<events.Count;
        return new(status.Id,status.Revision,lean,more ? lean[^1].Sequence : null,new(view.ThroughSequence,view.AtUs),view,matching,more?query.Offset+lean.Count:null);
    }
}
