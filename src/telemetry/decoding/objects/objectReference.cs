namespace SpellBook.Telemetry;

public static class ObjectReference
{
    public static Dictionary<string, object?> Read(BitReader reader, NetGuidCache cache, int depth = 0)
    {
        if (depth > 16) throw new InvalidDataException("Inline object depth");
        var guid = reader.Packed();
        Dictionary<string, object?> value = new() { ["guid"] = guid };
        if (guid != 1)
        {
            var path = cache.Path(guid);
            if (!path.StartsWith("NetGUID:", StringComparison.Ordinal)) value["classPath"] = path;
            return value;
        }
        var flags = reader.Bits(8);
        if ((flags & ~7ul) != 0) throw new InvalidDataException("Inline object flags");
        value["flags"] = flags;
        if ((flags & 1) != 0)
        {
            value["outer"] = Read(reader, cache, depth + 1);
            value["classPath"] = UnrealStrings.Read(reader);
            if ((flags & 4) != 0) value["checksum"] = reader.Bits(32);
        }
        return value;
    }
}
