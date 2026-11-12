namespace SpellBook.Telemetry;
public record GuidEntry(uint Guid, uint Outer, string Name);
public sealed class NetGuidCache
{
    public Dictionary<uint, GuidEntry> Entries { get; } = [];
    public string Path(uint guid, int depth = 0)
    {
        if (depth > 16 || !Entries.TryGetValue(guid, out var entry)) return $"NetGUID:{guid}";
        return entry.Outer == 0 || entry.Name.StartsWith('/') ? entry.Name : $"{Path(entry.Outer, depth + 1)}.{entry.Name}";
    }
    public uint Load(BitReader reader, bool exporting = false, int depth = 0)
    {
        if (depth > 16 || Entries.Count > 100000) throw new InvalidDataException("GUID cache limit");
        var guid = reader.Packed();
        if (guid != 0 && (guid == 1 || exporting))
        {
            var flags = reader.Bits(8);
            if ((flags & ~7ul) != 0) throw new InvalidDataException("Unknown GUID flags");
            if ((flags & 1) != 0)
            {
                var outer = Load(reader, exporting, depth + 1);
                var path = UnrealStrings.Read(reader);
                if ((flags & 4) != 0) reader.Bits(32);
                if (guid != 1) Entries[guid] = new(guid, outer, path);
            }
        }
        return guid;
    }
    public uint? Owner(uint guid)
    {
        for (var i = 0; i < 16 && Entries.TryGetValue(guid, out var entry); i++)
        {
            guid = entry.Outer;
            if ((guid & 1) == 0 && guid != 0) return guid;
        }
        return null;
    }
}
