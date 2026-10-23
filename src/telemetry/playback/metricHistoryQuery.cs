namespace SpellBook.Telemetry;

public static class MetricHistoryReader
{
    public static MetricHistoryPage Read(string root,MetricHistoryQuery query,CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        var metrics=query.Metrics??["health","stamina"];
        if(query.FromUs<0 || query.ToUs<query.FromUs || query.TrackId.Length is 0 or >256 || query.MaxPoints is <8 or >2048 || metrics.Length is 0 or >2 || metrics.Any(metric=>metric is not ("health" or "stamina"))) throw new ArgumentException("Invalid metric history query");
        metrics=metrics.Distinct().ToArray();
        using var connection=RecordingDatabase.Open(root,true); using var tx=connection.BeginTransaction();
        var status=TimelineQuery.Status(connection,tx); var view=ReadViews.Resolve(status,query.ToUs,query.ReadView);
        if(!RecordingDatabase.HasProjection(connection)) return new(status.Id,status.Revision,[],false,view);
        var scope=TrackScope.Resolve(connection,tx,view,query.TrackId);
        var result=new List<MetricSeries>();var truncated=false;
        var limit=query.MaxPoints/metrics.Length;
        var until=Math.Min(query.ToUs,view.AtUs);
        foreach(var metric in metrics)
        {
            if(query.FromUs>until) {result.Add(new(metric,[]));continue;}
            using var command=connection.CreateCommand();command.Transaction=tx;
            ReadViews.Bind(command,view);
            var tracks=scope.Bind(command);
            command.CommandText=$"""
                WITH seed AS (
                    SELECT value,lifetimeId,sequence FROM metrics
                    WHERE trackId IN ({tracks}) AND metric=$metric AND elapsedUs<$from AND sequence<=$head
                    ORDER BY elapsedUs DESC,sequence DESC,value IS NOT NULL DESC LIMIT 1
                )
                SELECT elapsedUs,value,lifetimeId FROM (
                    SELECT $from AS elapsedUs,value,lifetimeId,sequence FROM seed
                    UNION ALL
                    SELECT elapsedUs,value,lifetimeId,sequence FROM metrics
                    WHERE trackId IN ({tracks}) AND metric=$metric AND elapsedUs BETWEEN $from AND $until AND sequence<=$head
                ) ORDER BY elapsedUs,sequence,value IS NOT NULL
                """;
            command.Parameters.AddWithValue("$metric",metric);command.Parameters.AddWithValue("$from",query.FromUs);command.Parameters.AddWithValue("$until",until);
            using var cancel=ct.Register(command.Cancel);using var rows=command.ExecuteReader();
            var points=new List<MetricPoint>();
            string? lifetime=null;
            while(rows.Read())
            {
                ct.ThrowIfCancellationRequested();
                var point=new MetricPoint(rows.GetInt64(0),rows.IsDBNull(1)?null:rows.GetDouble(1),rows.GetString(2));
                if(lifetime is not null && lifetime!=point.LifetimeId) points.Add(new(point.ElapsedUs,null,point.LifetimeId));
                points.Add(point);lifetime=point.LifetimeId;
                // Compact only uninterrupted pieces; gap markers are never interpolated.
                if(points.Count>limit*8) { points=Reduce(points,limit*2);truncated=true; }
            }
            if(points.Count>limit) {points=Reduce(points,limit);truncated=true;}
            result.Add(new(metric,points));
        }
        return new(status.Id,status.Revision,result,truncated,view);
    }
    private static List<MetricPoint> Reduce(List<MetricPoint> points,int limit)
    {
        var segments=new List<(int Start,int Length,bool Known)>();
        var start=0;
        for(var i=1;i<=points.Count;i++)
        {
            if(i<points.Count && points[i].Value.HasValue==points[start].Value.HasValue) continue;
            segments.Add((start,i-start,points[start].Value.HasValue));
            start=i;
        }
        var minimum=segments.Sum(segment=>Math.Min(2,segment.Length));
        var first=0;
        // Drop whole old pieces when their boundaries cannot fit; never join across a removed gap.
        while(minimum>limit) minimum-=Math.Min(2,segments[first++].Length);
        var extra=limit-minimum;
        var capacity=segments.Skip(first).Where(segment=>segment.Known).Sum(segment=>segment.Length-Math.Min(2,segment.Length));
        var result=new List<MetricPoint>(limit);
        foreach(var segment in segments.Skip(first))
        {
            var required=Math.Min(2,segment.Length);
            var available=segment.Known?segment.Length-required:0;
            var additional=capacity==0?0:(int)((long)extra*available/capacity);
            extra-=additional;capacity-=available;
            if(segment.Known)
                result.AddRange(BoundedSamples.Extrema(points.GetRange(segment.Start,segment.Length),required+additional,point=>point.Value!.Value,point=>point.Value!.Value));
            else
            {
                result.Add(points[segment.Start]);
                if(segment.Length>1) result.Add(points[segment.Start+segment.Length-1]);
            }
        }
        return result;
    }
}
