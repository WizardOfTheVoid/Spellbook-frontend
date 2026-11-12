using Microsoft.Data.Sqlite;
using System.Text.Json;
namespace SpellBook.Telemetry;

public static class ItemEventQuery
{
    public static string Sql(string filter, string page, string order, bool indexed)
    {
        string Value(string column, string fallback) => indexed ? $"CASE WHEN i.sequence IS NULL THEN {fallback} ELSE i.{column} END" : fallback;
        var indexedKey = indexed ? "i.groupKey" : "NULL";
        var item = indexed ? "CASE WHEN i.sequence IS NOT NULL THEN 1 ELSE json_extract(r.event,'$.item') END" : "json_extract(r.event,'$.item')";
        var needsKey = indexed ? "i.sequence IS NULL AND " : "";
        var join = indexed ? "LEFT JOIN itemActivities i ON i.sequence=r.sequence" : "";
        return $$"""
        WITH filtered AS MATERIALIZED (
            SELECT r.sequence,r.elapsedUs,r.kind,r.entityId,{{indexedKey}} AS indexedGroupKey,{{item}} AS item,
                {{Value("classPath","COALESCE(NULLIF(TRIM(json_extract(r.event,'$.item.classPath')),''),'Unknown item')")}} AS classPath,
                CASE WHEN {{needsKey}}json_extract(r.event,'$.item') IS NOT NULL THEN COALESCE(json_extract(r.event,'$.item.attribution'),'unknown') END AS attribution,
                CASE WHEN {{needsKey}}json_extract(r.event,'$.item') IS NOT NULL THEN UPPER(NULLIF(json_extract(r.event,'$.item.playFabId'),'')) END AS account,
                {{Value("actorGuid","json_extract(r.event,'$.item.actorGuid')")}} AS actorGuid,
                {{Value("ownerGuid","NULLIF(json_extract(r.event,'$.item.ownerGuid'),0)")}} AS ownerGuid,
                {{Value("instigatorGuid","NULLIF(json_extract(r.event,'$.item.instigatorGuid'),0)")}} AS instigatorGuid,
                CAST({{Value("closeReason","json_extract(r.event,'$.item.closeReason')")}} AS INTEGER) AS closeReason,
                CASE WHEN {{needsKey}}json_extract(r.event,'$.item') IS NOT NULL
                    THEN COALESCE((SELECT MAX(g.sequence) FROM records g WHERE g.kind='captureGap' AND g.sequence<=r.sequence),0) ELSE 0 END AS continuity
            FROM records r {{join}} WHERE {{filter}}
        ), keyed AS (
            SELECT *,COALESCE(indexedGroupKey,CASE WHEN item IS NULL THEN json_array('event',sequence)
                ELSE json_array('item',continuity,elapsedUs/1000000,kind,classPath,attribution,
                    CASE WHEN account IS NOT NULL THEN json_array('account',account)
                    ELSE json_array('actor',ownerGuid,instigatorGuid) END) END) AS groupKey
            FROM filtered
        ), grouped AS (
            SELECT MIN(sequence) AS sequence,MIN(elapsedUs) AS elapsedUs,MAX(elapsedUs) AS lastElapsedUs,
                COUNT(*) AS count,groupKey,MIN(classPath) AS classPath,
                COUNT(DISTINCT actorGuid) AS actors,COUNT(DISTINCT COALESCE(entityId,'')) AS entities,
                COUNT(DISTINCT COALESCE(ownerGuid,-1)) AS owners,
                COUNT(DISTINCT COALESCE(instigatorGuid,-1)) AS instigators,
                COUNT(DISTINCT COALESCE(closeReason,'')) AS closeReasons
            FROM keyed GROUP BY groupKey
        )
        SELECT r.event,g.elapsedUs,g.lastElapsedUs,g.count,g.groupKey,g.classPath,
            g.actors,g.entities,g.owners,g.instigators,g.closeReasons,COUNT(*) OVER()
        FROM grouped g JOIN records r ON r.sequence=g.sequence
        WHERE {{page}} ORDER BY {{order}} LIMIT $limit OFFSET $offset
        """;
    }

    public static TelemetryEvent Read(SqliteDataReader reader)
    {
        var ev = JsonSerializer.Deserialize<TelemetryEvent>(reader.GetString(0), Wire.Json)!;
        if (ev.Item is not { } item) return ev;
        var multipleObjects = reader.GetInt64(6) > 1 || item.ActorGuid == 0 && reader.GetInt64(7) > 1;
        return ev with
        {
            ElapsedUs = reader.GetInt64(1),
            LastElapsedUs = reader.GetInt64(2),
            Count = reader.GetInt64(3),
            Detail = reader.GetInt64(3) > 1 ? $"{reader.GetInt64(3)} activities in this recorded second; individual evidence retained" : ev.Detail,
            GroupKey = reader.GetString(4),
            EntityId = multipleObjects || reader.GetInt64(7) > 1 ? null : ev.EntityId,
            Item = item with
            {
                ClassPath = reader.GetString(5),
                ActorGuid = multipleObjects ? 0 : item.ActorGuid,
                Location = multipleObjects ? null : item.Location,
                SpawnLocationPresent = multipleObjects ? null : item.SpawnLocationPresent,
                OwnerGuid = reader.GetInt64(8) > 1 ? null : item.OwnerGuid,
                InstigatorGuid = reader.GetInt64(9) > 1 ? null : item.InstigatorGuid,
                CloseReason = reader.GetInt64(10) > 1 ? null : item.CloseReason
            }
        };
    }
}
