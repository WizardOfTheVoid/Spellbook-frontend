using System.Text.Json;
namespace SpellBook.Telemetry;
public static class TrajectoryQueryReader
{
    public static TrajectoryPage Read(string root, TrajectoryQuery query, CancellationToken ct)
    {
        if (query.FromUs < 0 || query.ToUs < query.FromUs || query.EntityIds.Length > 64 || query.MaxPoints is < 2 or > 10000) throw new ArgumentException("Invalid trajectory query");
        using var c = RecordingDatabase.Open(root,true); using var tx = c.BeginTransaction(); var status = TimelineQuery.Status(c,tx);
        var view=ReadViews.Resolve(status,query.ToUs,query.ReadView);
        var projected=RecordingDatabase.HasProjection(c);
        var paths = new List<TrajectoryPath>(); var truncated = false;
        var legacyGaps=new List<long>();
        if(!projected)
        {
            using var gaps=c.CreateCommand();gaps.Transaction=tx;
            gaps.CommandText="SELECT sequence FROM records WHERE kind='captureGap' AND sequence<=$head ORDER BY sequence";
            gaps.Parameters.AddWithValue("$head",view.ThroughSequence);
            using var rows=gaps.ExecuteReader();while(rows.Read()) legacyGaps.Add(rows.GetInt64(0));
        }
        var remainingBytes = Wire.MaxBytes - 4096;
        var remainingPoints=Math.Min(2048,query.MaxPoints);
        var ids=query.EntityIds.Distinct().ToArray();
        for(var entityIndex=0;entityIndex<ids.Length;entityIndex++)
        {
            var id=ids[entityIndex];
            var budget=Math.Max(2,remainingPoints/(ids.Length-entityIndex));
            if(remainingPoints<2) {truncated=true;break;}
            using var cmd = c.CreateCommand(); cmd.Transaction = tx;
            cmd.CommandText = projected?$"SELECT {PositionReader.Columns} FROM positions WHERE entityId=$id AND elapsedUs BETWEEN $from AND $to AND sequence<=$head ORDER BY elapsedUs,sequence":"SELECT position FROM records WHERE entityId=$id AND elapsedUs BETWEEN $from AND $to AND sequence<=$head AND position IS NOT NULL ORDER BY elapsedUs,sequence";
            cmd.Parameters.AddWithValue("$id",id); cmd.Parameters.AddWithValue("$from",query.FromUs); cmd.Parameters.AddWithValue("$to",Math.Min(query.ToUs,view.AtUs));cmd.Parameters.AddWithValue("$head",view.ThroughSequence);
            using var cancel = ct.Register(cmd.Cancel); using var reader = cmd.ExecuteReader();
            var segment = new List<PositionObservation>();
            var segments=new List<IReadOnlyList<PositionObservation>>();
            void Finish()
            {
                if (segment.Count == 0) return;
                if(segment.Count>budget) truncated=true;
                segments.Add(BoundedSamples.Extrema(segment,budget,point=>point.Location.X,point=>point.Location.Y).ToArray());
                if(segments.Count>Math.Max(1,budget/2)) {segments.RemoveAt(0);truncated=true;}
                segment.Clear();
            }
            long? continuity=null;
            var gapIndex=0;
            while (reader.Read())
            {
                ct.ThrowIfCancellationRequested();
                var p = projected?PositionReader.Read(reader):JsonSerializer.Deserialize<PositionObservation>(reader.GetString(0),Wire.Json)!;
                while(!projected && gapIndex<legacyGaps.Count && legacyGaps[gapIndex]<=p.Sequence) gapIndex++;
                var nextContinuity=projected?reader.GetInt64(17):gapIndex;
                if (segment.LastOrDefault() is { } prior && (continuity!=nextContinuity || p.CoordinateSpace != prior.CoordinateSpace || p.BaseGuid != prior.BaseGuid || p.ElapsedUs - prior.ElapsedUs > 500000 || Math.Abs(p.Location.X - prior.Location.X) + Math.Abs(p.Location.Y - prior.Location.Y) > 1000)) Finish();
                continuity=nextContinuity;
                segment.Add(p);
                if(segment.Count>8192) {segment=BoundedSamples.Extrema(segment,4096,point=>point.Location.X,point=>point.Location.Y).ToList();truncated=true;}
            }
            Finish();
            var retained=0;
            for(var index=0;index<segments.Count;index++)
            {
                var source=segments[index];
                var available=Math.Min(remainingPoints,(budget-retained)/(segments.Count-index));
                if(source.Count>available) truncated=true;
                var points=BoundedSamples.Extrema(source,available,point=>point.Location.X,point=>point.Location.Y);
                var path=new TrajectoryPath(id,source[0].CoordinateSpace,points);
                var bytes=ResponseBudget.Size(path)+1;
                if(bytes>remainingBytes) {truncated=true;break;}
                if(points.Count>0) paths.Add(path);
                remainingBytes-=bytes;remainingPoints-=points.Count;retained+=points.Count;
            }
            if (remainingBytes < 1024) break;
        }
        return new(status.Id,status.Revision,paths,truncated,view);
    }
}
