using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;
public static class RecordingDatabase
{
    public static SqliteConnection Open(string root, bool readOnly = false)
    {
        var connection = new SqliteConnection(new SqliteConnectionStringBuilder { DataSource = Path.Combine(root,"telemetry.sqlite"), Mode = readOnly ? SqliteOpenMode.ReadOnly : SqliteOpenMode.ReadWriteCreate, Pooling = false }.ToString());
        connection.Open();
        using var command = connection.CreateCommand(); command.CommandText = "PRAGMA busy_timeout=5000"; command.ExecuteNonQuery();
        return connection;
    }
    public static void Initialize(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT 1 FROM sqlite_master WHERE name='records'";
        var isNew = command.ExecuteScalar() is null;
        command.CommandText = """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS records(sequence INTEGER PRIMARY KEY, elapsedUs INTEGER NOT NULL, kind TEXT NOT NULL, entityId TEXT, event TEXT NOT NULL, entity TEXT, position TEXT);
            CREATE INDEX IF NOT EXISTS records_time ON records(elapsedUs,sequence);
            CREATE INDEX IF NOT EXISTS records_entity_time ON records(entityId,elapsedUs,sequence);
            CREATE INDEX IF NOT EXISTS records_kind_time ON records(kind,elapsedUs,sequence);
            CREATE INDEX IF NOT EXISTS records_gaps ON records(sequence) WHERE kind='captureGap';
            CREATE TABLE IF NOT EXISTS itemActivities(sequence INTEGER PRIMARY KEY,groupKey TEXT NOT NULL,classPath TEXT NOT NULL,actorGuid INTEGER NOT NULL,ownerGuid INTEGER,instigatorGuid INTEGER,closeReason INTEGER);
            CREATE INDEX IF NOT EXISTS itemActivities_group ON itemActivities(groupKey,sequence);
            CREATE TABLE IF NOT EXISTS packets(ordinal INTEGER PRIMARY KEY, elapsedUs INTEGER NOT NULL, segment INTEGER, offset INTEGER);
            CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS names(playFabId TEXT PRIMARY KEY, json TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS entities(entityId TEXT PRIMARY KEY, firstUs INTEGER NOT NULL, hasPosition INTEGER NOT NULL);
            """;
        command.ExecuteNonQuery();
        if (isNew)
        {
            command.CommandText = """
                CREATE TABLE positions(sequence INTEGER PRIMARY KEY,entityId TEXT NOT NULL,elapsedUs INTEGER NOT NULL,ordinal INTEGER NOT NULL,x REAL,y REAL,z REAL,rawX REAL,rawY REAL,rawZ REAL,source TEXT,coordinateSpace TEXT,baseGuid INTEGER,reason TEXT,playFabId TEXT,playerStateGuid INTEGER,sourceUtc INTEGER,continuity INTEGER NOT NULL);
                CREATE INDEX positions_entity_time ON positions(entityId,elapsedUs,sequence);
                CREATE TABLE entityStates(sequence INTEGER PRIMARY KEY,entityId TEXT NOT NULL,elapsedUs INTEGER NOT NULL,json TEXT NOT NULL);
                CREATE INDEX entityStates_entity_time ON entityStates(entityId,elapsedUs DESC,sequence DESC);
                CREATE TABLE players(lifetimeId TEXT PRIMARY KEY,trackId TEXT NOT NULL,entityId TEXT NOT NULL,firstUs INTEGER NOT NULL,firstSequence INTEGER NOT NULL);
                CREATE INDEX players_track ON players(trackId,firstUs);
                CREATE INDEX players_time ON players(firstUs,lifetimeId);
                CREATE TABLE playerTracks(trackId TEXT PRIMARY KEY);
                CREATE TABLE playerTotals(trackId TEXT NOT NULL,sequence INTEGER NOT NULL,elapsedUs INTEGER NOT NULL,damageDealt REAL,damageReceived REAL,kills INTEGER,deaths INTEGER,PRIMARY KEY(trackId,sequence));
                CREATE INDEX playerTotals_time ON playerTotals(trackId,elapsedUs DESC,sequence DESC);
                CREATE TABLE playerStates(sequence INTEGER PRIMARY KEY,lifetimeId TEXT NOT NULL,elapsedUs INTEGER NOT NULL,json TEXT NOT NULL);
                CREATE INDEX playerStates_lifetime_time ON playerStates(lifetimeId,elapsedUs DESC,sequence DESC);
                CREATE TABLE membership(sequence INTEGER PRIMARY KEY,elapsedUs INTEGER NOT NULL,lifetimeId TEXT NOT NULL,active INTEGER NOT NULL);
                CREATE INDEX membership_time ON membership(elapsedUs,sequence);
                CREATE TABLE rosterCheckpoints(sequence INTEGER PRIMARY KEY,elapsedUs INTEGER NOT NULL,json TEXT NOT NULL);
                CREATE INDEX rosterCheckpoints_time ON rosterCheckpoints(elapsedUs,sequence);
                CREATE TABLE rosterProgress(sequence INTEGER PRIMARY KEY,elapsedUs INTEGER NOT NULL,activePlayers INTEGER NOT NULL,knownPlayers INTEGER NOT NULL);
                CREATE INDEX rosterProgress_time ON rosterProgress(elapsedUs DESC,sequence DESC);
                CREATE TABLE metrics(sequence INTEGER NOT NULL,trackId TEXT NOT NULL,lifetimeId TEXT NOT NULL,elapsedUs INTEGER NOT NULL,metric TEXT NOT NULL,value REAL,PRIMARY KEY(sequence,trackId,lifetimeId,metric));
                CREATE INDEX metrics_track_time ON metrics(trackId,metric,elapsedUs,sequence);
                CREATE TABLE totalProgress(sequence INTEGER NOT NULL,elapsedUs INTEGER NOT NULL,scope TEXT NOT NULL,kind TEXT NOT NULL,count INTEGER NOT NULL,amount REAL,PRIMARY KEY(scope,kind,sequence));
                CREATE INDEX totalProgress_time ON totalProgress(scope,kind,elapsedUs DESC,sequence DESC);
                CREATE TABLE totalKinds(scope TEXT NOT NULL,kind TEXT NOT NULL,PRIMARY KEY(scope,kind));
                CREATE TABLE eventGroups(groupKey TEXT NOT NULL,scope TEXT NOT NULL,sequence INTEGER NOT NULL,firstUs INTEGER NOT NULL,lastUs INTEGER NOT NULL,kind TEXT NOT NULL,search TEXT NOT NULL,PRIMARY KEY(groupKey,scope));
                CREATE INDEX eventGroups_time ON eventGroups(scope,firstUs,sequence);
                CREATE INDEX eventGroups_sequence ON eventGroups(scope,sequence);
                CREATE TABLE groupProgress(groupKey TEXT NOT NULL,scope TEXT NOT NULL,sequence INTEGER NOT NULL,elapsedUs INTEGER NOT NULL,count INTEGER NOT NULL,event TEXT NOT NULL,PRIMARY KEY(groupKey,scope,sequence));
                CREATE INDEX groupProgress_time ON groupProgress(groupKey,scope,elapsedUs,sequence);
                CREATE INDEX groupProgress_scope ON groupProgress(scope,elapsedUs,sequence,groupKey);
                CREATE TABLE packetProgress(ordinal INTEGER PRIMARY KEY,elapsedUs INTEGER NOT NULL,packetCount INTEGER NOT NULL,lossCount INTEGER NOT NULL,positionCount INTEGER NOT NULL);
                CREATE INDEX packetProgress_time ON packetProgress(elapsedUs,ordinal);
                PRAGMA user_version=2;
                """;
            command.ExecuteNonQuery();
        }
        command.CommandText = "PRAGMA user_version";
        if ((long)command.ExecuteScalar()! == 0)
        {
            command.CommandText = "INSERT OR IGNORE INTO entities SELECT entityId,MIN(elapsedUs),MAX(position IS NOT NULL) FROM records WHERE entityId IS NOT NULL AND entity IS NOT NULL GROUP BY entityId; PRAGMA user_version=1";
            command.ExecuteNonQuery();
        }
        if(HasProjection(connection))
        {
            command.CommandText="""
                DROP INDEX IF EXISTS eventGroups_kind_sequence;
                CREATE INDEX IF NOT EXISTS eventGroups_kind_page ON eventGroups(scope,kind,sequence,firstUs,lastUs);
                CREATE INDEX IF NOT EXISTS eventGroups_kind_time ON eventGroups(scope,kind,firstUs,sequence,search);
                """;
            command.ExecuteNonQuery();
        }
    }
    public static bool HasProjection(SqliteConnection connection)
    {
        using var command=connection.CreateCommand();
        command.CommandText="PRAGMA user_version";
        return (long)command.ExecuteScalar()!>=2;
    }
    public static RecordingStatus? Status(string root)
    {
        using var c = Open(root, true); using var query = c.CreateCommand(); query.CommandText = "SELECT json FROM state WHERE id=1";
        return query.ExecuteScalar() is string json ? System.Text.Json.JsonSerializer.Deserialize<RecordingStatus>(json, Wire.Json) : null;
    }
}
