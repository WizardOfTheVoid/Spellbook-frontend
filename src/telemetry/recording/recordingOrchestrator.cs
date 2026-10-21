using Microsoft.Data.Sqlite;
namespace SpellBook.Telemetry;
public sealed class RecordingOrchestrator : IDisposable
{
    private readonly string root;
    private readonly RecordingStatus status;
    private readonly TelemetryOptions options;
    private readonly SqliteConnection connection;
    private readonly PacketLog raw;
    private readonly PreparedCommands commands;
    private readonly ProjectionWriter? projection;
    private readonly bool publishProjection;
    private SqliteTransaction? transaction;
    private readonly object gate = new();
    private long sequence;
    private long continuity;
    private long lastPacketUs;
    private long pendingBytes;
    private long accountedBytes;
    private long lastReconcile = Environment.TickCount64;
    private long lastFlush = Environment.TickCount64;
    public bool HasPending => transaction is not null;
    public bool ShouldFlush => pendingBytes >= 4L*1024*1024 || HasPending && Environment.TickCount64-lastFlush>=100;
    public bool ShouldWatermark => !HasPending && Environment.TickCount64-lastFlush>=1000;
    public RecordingOrchestrator(string root, RecordingStatus status, TelemetryOptions options)
    {
        this.root = root; this.status = status; this.options = options;
        Directory.CreateDirectory(root); connection = RecordingDatabase.Open(root); RecordingDatabase.Initialize(connection);
        commands=new(connection);
        if(RecordingDatabase.HasProjection(connection))
        {
            status.SchemaVersion=2; status.ProjectionVersion=1;
            projection=new(commands);
        }
        sequence = status.Head.Sequence;
        publishProjection=sequence==0;
        using (var gaps = connection.CreateCommand()) { gaps.CommandText = "SELECT COALESCE(MAX(sequence),0) FROM records WHERE kind='captureGap'"; continuity = (long)gaps.ExecuteScalar()!; }
        raw = new(Path.Combine(root,"packets"), options.SegmentSize);
        accountedBytes=status.SizeBytes;
        Save();
    }
    public ValueTask Append(PacketEnvelope packet, IReadOnlyList<TrackedRecord> rows)
    {
        lock (gate)
        {
            var offset = raw.Append(packet);
            lastPacketUs = Math.Max(lastPacketUs,packet.ElapsedUs);
            transaction ??= connection.BeginTransaction();
            Execute("INSERT INTO packets VALUES($ordinal,$time,$segment,$offset)", ("$ordinal",packet.Ordinal),("$time",packet.ElapsedUs),("$segment",offset.Segment),("$offset",offset.Offset));
            foreach (var record in rows)
            {
                var ev = record.Event with { Sequence = ++sequence };
                var point = record.Position is null ? null : record.Position with { Sequence = sequence };
                var entity = record.Entity;
                if (entity is not null && point is not null) entity = entity with { Position = point };
                if (ev.Kind == "captureGap") continuity = ev.Sequence;
                if(projection is not null)
                {
                    projection.Append(transaction,ev,entity,point,record.Player,continuity);
                    if(ev.Kind!="position")
                    {
                        var json=Wire.Serialize(ev);
                        Execute("INSERT INTO records VALUES($sequence,$time,$kind,$id,$event,NULL,NULL)",("$sequence",sequence),("$time",ev.ElapsedUs),("$kind",ev.Kind),("$id",ev.EntityId),("$event",json));
                        pendingBytes+=json.Length*2+256;
                    }
                    if(point is not null) pendingBytes+=192;
                    if(record.Player is not null) pendingBytes+=512;
                }
                else
                {
                    if (entity is not null) Execute("INSERT INTO entities VALUES($id,$time,$position) ON CONFLICT(entityId) DO UPDATE SET firstUs=MIN(firstUs,excluded.firstUs),hasPosition=MAX(hasPosition,excluded.hasPosition)",("$id",entity.EntityId),("$time",ev.ElapsedUs),("$position",point is null ? 0 : 1));
                    Execute("INSERT INTO records VALUES($sequence,$time,$kind,$id,$event,$entity,$position)", ("$sequence",sequence),("$time",ev.ElapsedUs),("$kind",ev.Kind),("$id",ev.EntityId),("$event",Wire.Serialize(ev)),("$entity",entity is null ? null : Wire.Serialize(entity)),("$position",point is null ? null : Wire.Serialize(point)));
                    ItemActivityIndex.Append(connection,transaction,ev,continuity);
                    pendingBytes+=1024;
                }
            }
            status.PacketCount++; status.LossCount += packet.LossCount;
            if(projection is not null) Execute("INSERT INTO packetProgress VALUES($ordinal,$time,$packets,$loss,$positions)",("$ordinal",packet.Ordinal),("$time",packet.ElapsedUs),("$packets",status.PacketCount),("$loss",status.LossCount),("$positions",projection.Positions));
            pendingBytes+=packet.Bytes.Length+192;
            status.SizeBytes=accountedBytes+pendingBytes;
            if (status.SizeBytes >= options.SessionLimit) throw new IOException("storageLimitReached");
        }
        return ValueTask.CompletedTask;
    }
    private void Execute(string sql, params (string Name, object? Value)[] parameters)
    {
        commands.Execute(transaction,sql,parameters);
    }
    public Task<CommittedHead> Flush(long elapsedUs)
    {
        lock (gate)
        {
            raw.Flush();
            status.Head = new(sequence, Math.Max(lastPacketUs,Math.Max(status.Head.ElapsedUs, elapsedUs))); status.Revision++; status.UpdateSequence++;
            Execute("INSERT INTO state VALUES(1,$json) ON CONFLICT(id) DO UPDATE SET json=excluded.json", ("$json",Wire.Serialize(status)));
            transaction?.Commit(); transaction?.Dispose(); transaction = null;
            accountedBytes=status.SizeBytes; pendingBytes=0; lastFlush=Environment.TickCount64;
            if(lastFlush-lastReconcile>=5000) ReconcileStorage();
            Save();
            CommittedUpdates.Publish(root,status,publishProjection?projection:null);
            return Task.FromResult(status.Head);
        }
    }
    public async Task Complete(string reason, long elapsedUs)
    {
        status.StopReason = reason; status.State = reason == "interrupted" ? "interrupted" : "saved";
        elapsedUs = Math.Max(lastPacketUs,Math.Max(status.Head.ElapsedUs,elapsedUs));
        status.StoppedAtUtc = status.StartedAtUtc?.AddTicks(elapsedUs * 10) ?? DateTimeOffset.UtcNow;
        await Flush(elapsedUs);
        raw.Dispose();
        ReconcileStorage();
        var hashes = Directory.Exists(Path.Combine(root,"packets")) ? Directory.GetFiles(Path.Combine(root,"packets"),"*.pcapng").ToDictionary(path => Path.GetFileName(path)!, path => { using var file = File.OpenRead(path); return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(file)).ToLowerInvariant(); }) : [];
        File.WriteAllText(Path.Combine(root,"packetHashes.json"), Wire.Serialize(hashes));
    }
    public void AppendNames(IReadOnlyList<NameObservation> names)
    {
        lock (gate)
        {
            if (names.Count > 128) throw new ArgumentException("Too many names");
            foreach (var name in names)
            {
                if (!Wire.IsPlayFabId(name.PlayFabId) || name.Name.Length is 0 or > 256 || name.Source != "spellbookProduction") throw new ArgumentException("Invalid name");
                using var proof = connection.CreateCommand(); proof.Transaction = transaction;
                proof.CommandText = projection is null ? "SELECT 1 FROM records WHERE json_extract(entity,'$.playFabId')=$id LIMIT 1" : "SELECT 1 FROM entityStates WHERE json_extract(json,'$.playFabId')=$id UNION ALL SELECT 1 FROM playerStates WHERE json_extract(json,'$.playFabId')=$id LIMIT 1";
                proof.Parameters.AddWithValue("$id",name.PlayFabId.ToUpperInvariant());
                if (proof.ExecuteScalar() is null) throw new ArgumentException("Account not observed in recording");
            }
            foreach (var name in names) Execute("INSERT INTO names VALUES($id,$json) ON CONFLICT(playFabId) DO UPDATE SET json=excluded.json",("$id",name.PlayFabId.ToUpperInvariant()),("$json",Wire.Serialize(name)));
            Flush(status.Head.ElapsedUs).GetAwaiter().GetResult();
        }
    }
    public void PreserveNames(IReadOnlyList<NameObservation> names)
    {
        lock(gate)
        {
            if(names.Count==0) return;
            foreach(var name in names) Execute("INSERT INTO names VALUES($id,$json) ON CONFLICT(playFabId) DO UPDATE SET json=excluded.json",("$id",name.PlayFabId.ToUpperInvariant()),("$json",Wire.Serialize(name)));
            Flush(status.Head.ElapsedUs).GetAwaiter().GetResult();
        }
    }
    private void Save()
    {
        AtomicRecordingFile.Write(Path.Combine(root,"manifest.json"),Wire.Serialize(status));
    }
    private void ReconcileStorage()
    {
        accountedBytes=raw.Size;
        foreach(var suffix in new[]{"","-wal","-shm"})
        {
            var file=new FileInfo(Path.Combine(root,$"telemetry.sqlite{suffix}"));
            if(file.Exists) accountedBytes+=file.Length;
        }
        status.SizeBytes=accountedBytes+pendingBytes; lastReconcile=Environment.TickCount64;
    }
    public void Dispose() { lock (gate) { transaction?.Dispose(); commands.Dispose(); connection.Dispose(); raw.Dispose(); CommittedUpdates.Release(root); } }
}
