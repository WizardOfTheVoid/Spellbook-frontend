using System.Text;
namespace SpellBook.Telemetry;

public static class ResponseBudget
{
    public static int Size<T>(T value)=>Encoding.UTF8.GetByteCount(Wire.Serialize(value));
    public static IReadOnlyList<T> Take<T>(IReadOnlyList<T> rows,int maximumBytes=Wire.MaxBytes-16_384)
    {
        var result=new List<T>();var remaining=maximumBytes;
        foreach(var row in rows)
        {
            var bytes=Size(row)+1;
            if(bytes>remaining) break;
            result.Add(row);remaining-=bytes;
        }
        if(rows.Count>0 && result.Count==0) throw new InvalidDataException("A telemetry detail exceeds the response budget");
        return result;
    }
    public static TelemetryEvent Lean(TelemetryEvent ev)
    {
        var omitted=ev.Player?.Source?.RawBody is not null;
        var player=ev.Player is null?null:ev.Player with {Source=ev.Player.Source is {} source?source with {RawBody=null}:null};
        if(player?.Values is {} values && Size(values)>4096) {player=player with {Values=null};omitted=true;}
        if(player?.Contributors?.Count>128) {player=player with {Contributors=player.Contributors.Take(128).ToArray()};omitted=true;}
        return ev with {Player=player,DetailTruncated=ev.DetailTruncated||omitted};
    }
    public static PlayerStateSnapshot Lean(PlayerStateSnapshot player)
    {
        var omitted=player.Source?.RawBody is not null;
        if(player.Profile is {} profile && Size(profile)>4096) {player=player with {Profile=null};omitted=true;}
        if(player.Inventory?.Count>256) {player=player with {Inventory=player.Inventory.Take(256).ToArray()};omitted=true;}
        if(player.Statuses?.Count>256) {player=player with {Statuses=player.Statuses.Take(256).ToArray()};omitted=true;}
        return player with {Source=player.Source is {} source?source with {RawBody=null}:null,DetailTruncated=player.DetailTruncated||omitted};
    }
}
