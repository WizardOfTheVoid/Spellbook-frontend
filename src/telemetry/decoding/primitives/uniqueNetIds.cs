namespace SpellBook.Telemetry;
public record UniqueNetId(string? Type, string? Id);
public static class UniqueNetIds
{
    public static UniqueNetId Read(BitReader r)
    {
        var flags = r.Bits(8);
        if ((flags & 4) != 0) throw new UnsupportedFieldException("Unique ID flags");
        if ((flags & 3) == 3) return new(null, null);
        var type = flags >> 3 == 31 ? UnrealStrings.Read(r) : $"SubsystemHash:{flags >> 3}";
        var id = (flags & 1) != 0 ? Convert.ToHexString(r.Bytes((int)r.Bits(8))) : UnrealStrings.Read(r);
        return new(type, id);
    }
}
