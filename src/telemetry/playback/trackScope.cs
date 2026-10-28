using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public sealed record TrackScope(string Canonical,IReadOnlyList<string> Tracks)
{
    public static TrackScope Resolve(SqliteConnection connection,SqliteTransaction tx,ReadView view,string requested)
    {
        var found=PlayerCatalog.Latest(connection,tx,view,requested);
        return found is null?new(requested,[requested]):new(found.TrackId,new[]{found.TrackId}.Concat(found.Aliases??[]).Distinct().ToArray());
    }
    public string Bind(SqliteCommand command,string prefix="track",bool scopes=false)
    {
        return string.Join(',',Tracks.Select((track,index)=>{
            var name=$"${prefix}{index}";command.Parameters.AddWithValue(name,scopes?$"track:{track}":track);return name;
        }));
    }
}
