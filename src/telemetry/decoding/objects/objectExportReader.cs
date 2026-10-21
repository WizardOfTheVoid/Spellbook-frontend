namespace SpellBook.Telemetry;
public static class ObjectExportReader
{
    public static void Read(BitReader r, NetGuidCache cache)
    {
        if (r.Bits(1) != 0) throw new UnsupportedFieldException("Replay export layout");
        var count = r.Bits(32);
        if (count > 2048) throw new InvalidDataException("GUID export count");
        for (ulong i = 0; i < count; i++) cache.Load(r, true);
    }
}
