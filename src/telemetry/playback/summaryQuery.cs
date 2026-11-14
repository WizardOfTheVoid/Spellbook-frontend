using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public static class SummaryQuery
{
    public static TelemetrySummary Read(SqliteConnection connection,SqliteTransaction tx,ReadView view,string? trackId)
    {
        var scope=trackId is null?null:TrackScope.Resolve(connection,tx,view,trackId);
        using var command=connection.CreateCommand();
        command.Transaction=tx; ReadViews.Bind(command,view);
        command.Parameters.AddWithValue("$scope",scope is null?"":$"track:{scope.Canonical}");
        command.CommandText="""
            SELECT p.kind,p.count,p.amount FROM totalKinds k CROSS JOIN totalProgress p ON p.scope=k.scope AND p.kind=k.kind AND p.sequence=(
                SELECT sequence FROM totalProgress WHERE scope=k.scope AND kind=k.kind AND elapsedUs<=$time AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1)
            WHERE k.scope=$scope
            """;
        if(scope?.Tracks.Count>1)
            command.CommandText=$"""
                SELECT r.kind,SUM(COALESCE(json_extract(r.event,'$.count'),1)),SUM(json_extract(r.event,'$.player.amount'))
                FROM (SELECT DISTINCT sequence FROM groupProgress WHERE scope IN ({scope.Bind(command,scopes:true)}) AND elapsedUs<=$time AND sequence<=$head) p
                JOIN records r ON r.sequence=p.sequence GROUP BY r.kind
                """;
        var counts=new Dictionary<string,long>();
        var amounts=new Dictionary<string,double>();
        using(var rows=command.ExecuteReader())
            while(rows.Read()) { counts[rows.GetString(0)]=rows.GetInt64(1); if(!rows.IsDBNull(2)) amounts[rows.GetString(0)]=rows.GetDouble(2); }
        command.Parameters.Clear(); ReadViews.Bind(command,view);
        command.CommandText="SELECT activePlayers,knownPlayers FROM rosterProgress WHERE elapsedUs<=$time AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1";
        long active=0,known=0;
        using(var roster=command.ExecuteReader())
            if(roster.Read()) {active=roster.GetInt64(0);known=roster.GetInt64(1);}
        command.CommandText="""
            SELECT SUM(p.damageDealt),SUM(p.damageReceived),SUM(p.kills),SUM(p.deaths)
            FROM playerTracks t CROSS JOIN playerTotals p ON p.trackId=t.trackId AND p.sequence=(
                SELECT sequence FROM playerTotals WHERE trackId=t.trackId AND elapsedUs<=$time AND sequence<=$head ORDER BY elapsedUs DESC,sequence DESC LIMIT 1)
            WHERE $track IS NULL OR t.trackId=$track
            """;
        command.Parameters.AddWithValue("$track",(object?)scope?.Canonical??DBNull.Value);
        using var totals=command.ExecuteReader();totals.Read();
        return new(active,known,counts,totals.IsDBNull(0)?null:totals.GetDouble(0),totals.IsDBNull(1)?null:totals.GetDouble(1),totals.IsDBNull(2)?null:totals.GetInt64(2),totals.IsDBNull(3)?null:totals.GetInt64(3),amounts.TryGetValue("healing",out var healing)?healing:null);
    }
}
