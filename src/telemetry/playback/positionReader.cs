using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;

public static class PositionReader
{
    public const string Columns="entityId,elapsedUs,ordinal,sequence,x,y,z,rawX,rawY,rawZ,source,coordinateSpace,baseGuid,reason,playFabId,playerStateGuid,sourceUtc,continuity";
    public static PositionObservation Read(SqliteDataReader row)=>new(
        row.GetString(0),row.GetInt64(1),row.GetInt64(2),row.GetInt64(3),
        new(row.GetDouble(4),row.GetDouble(5),row.GetDouble(6)),new(row.GetDouble(7),row.GetDouble(8),row.GetDouble(9)),
        row.GetString(10),row.GetString(11),(uint)row.GetInt64(12),row.GetString(13),
        row.IsDBNull(14)?null:row.GetString(14),row.IsDBNull(15)?null:(uint)row.GetInt64(15),row.IsDBNull(16)?null:new DateTimeOffset(row.GetInt64(16),TimeSpan.Zero));
}
