namespace SpellBook.Telemetry;

public static class BoundedSamples
{
    public static IReadOnlyList<T> Extrema<T>(IReadOnlyList<T> source,int limit,Func<T,double> x,Func<T,double> y)
    {
        if(source.Count<=limit) return source;
        if(limit<2) return source.Take(limit).ToArray();
        var retained=new SortedSet<int>{0,source.Count-1};
        var buckets=Math.Max(1,(limit-2)/4);
        for(var bucket=0;bucket<buckets;bucket++)
        {
            var first=1+(source.Count-2)*bucket/buckets;
            var end=1+(source.Count-2)*(bucket+1)/buckets;
            var minX=first;var maxX=first;var minY=first;var maxY=first;
            for(var i=first+1;i<end;i++)
            {
                if(x(source[i])<x(source[minX])) minX=i;
                if(x(source[i])>x(source[maxX])) maxX=i;
                if(y(source[i])<y(source[minY])) minY=i;
                if(y(source[i])>y(source[maxY])) maxY=i;
            }
            foreach(var index in new[]{minX,maxX,minY,maxY}) retained.Add(index);
        }
        return retained.Take(limit-1).Append(source.Count-1).Distinct().Select(index=>source[index]).ToArray();
    }
}
