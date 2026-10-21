using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public static class ItemActivityIndex
{
    public static void Append(SqliteConnection connection, SqliteTransaction? transaction, TelemetryEvent ev, long continuity)
    {
        if (ev.Item is not { } item) return;
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = """
            INSERT INTO itemActivities(sequence,groupKey,classPath,actorGuid,ownerGuid,instigatorGuid,closeReason)
            VALUES($sequence,json_array('item',$continuity,$bucket,$kind,$class,$attribution,
                CASE WHEN $account IS NOT NULL THEN json_array('account',$account)
                ELSE json_array('actor',$owner,$instigator) END),$class,$actor,$owner,$instigator,$reason)
            """;
        (string Name, object? Value)[] values =
        [
            ("$sequence",ev.Sequence),("$continuity",continuity),("$bucket",ev.ElapsedUs/1_000_000),
            ("$kind",ev.Kind),("$class",string.IsNullOrWhiteSpace(item.ClassPath) ? "Unknown item" : item.ClassPath.Trim()),
            ("$attribution",item.Attribution ?? "unknown"),("$account",string.IsNullOrEmpty(item.PlayFabId) ? null : item.PlayFabId.ToUpperInvariant()),
            ("$actor",item.ActorGuid),("$owner",item.OwnerGuid is > 0 ? item.OwnerGuid : null),
            ("$instigator",item.InstigatorGuid is > 0 ? item.InstigatorGuid : null),("$reason",item.CloseReason)
        ];
        foreach (var value in values) command.Parameters.AddWithValue(value.Name,value.Value ?? DBNull.Value);
        command.ExecuteNonQuery();
    }
}
