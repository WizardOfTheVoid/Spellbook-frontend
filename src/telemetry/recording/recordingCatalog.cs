using System.Text.Json;
namespace SpellBook.Telemetry;
public sealed class RecordingCatalog(TelemetryOptions options)
{
    private long lastStorageCheck;
    private long accountedBytes;
    public string Root => options.Root;
    public string PathFor(string id)
    {
        if (!Guid.TryParseExact(id,"D",out _)) throw new ArgumentException("Invalid recording ID");
        return Path.Combine(Root,id);
    }
    public string DataPath(string id)
    {
        var root = PathFor(id); var pointer = Path.Combine(root,"view.json");
        if (!File.Exists(pointer)) return root;
        var generation = JsonSerializer.Deserialize<string>(AtomicRecordingFile.Read(pointer),Wire.Json);
        if (!Guid.TryParse(generation,out _)) throw new InvalidDataException("Invalid recording generation");
        return Path.Combine(root,"derived",generation);
    }
    public RecordingStatus Get(string id)
    {
        var path = DataPath(id);
        if (!File.Exists(Path.Combine(path,"telemetry.sqlite"))) throw new KeyNotFoundException("Recording not found");
        return RecordingDatabase.Status(path) ?? throw new InvalidDataException("Recording has no committed state");
    }
    public IReadOnlyList<RecordingStatus> List()
    {
        Directory.CreateDirectory(Root); var result = new List<RecordingStatus>();
        foreach (var directory in Directory.GetDirectories(Root))
        {
            var id = Path.GetFileName(directory); if (!Guid.TryParse(id,out _)) continue;
            try { result.Add(Get(id)); } catch (Exception ex) when (ex is IOException or InvalidDataException or Microsoft.Data.Sqlite.SqliteException or KeyNotFoundException) { }
        }
        return result.OrderByDescending(r=>r.RequestedAtUtc).ToArray();
    }
    public long Size() => Directory.Exists(Root) ? Directory.EnumerateFiles(Root,"*",SearchOption.AllDirectories).Sum(p=>new FileInfo(p).Length) : 0;
    public void Account(long bytes)=>Interlocked.Add(ref accountedBytes,bytes);
    public void CheckStorage(bool force = false)
    {
        var now=Environment.TickCount64;
        if(accountedBytes>=options.TotalLimit) throw new IOException("storageLimitReached");
        if(!force && now-lastStorageCheck<5000) return;
        accountedBytes=Size(); lastStorageCheck=now;
        if (accountedBytes >= options.TotalLimit || new DriveInfo(Path.GetPathRoot(Root)!).AvailableFreeSpace < options.FreeSpaceFloor) throw new IOException("storageLimitReached");
    }
}
