namespace SpellBook.Telemetry;
public static class NetVectors
{
    public static Vec3 Read(BitReader reader, double scale = 10, int maxBits = 24)
    {
        var bits = reader.Int(maxBits);
        var bias = 1L << (bits + 1);
        double Part() => ((long)reader.Bits(bits + 2) - bias) / scale;
        return new(Part(), Part(), Part());
    }
    public static Vec3 Rotation(BitReader r)
    {
        double Part() => r.Bits(1) != 0 ? r.Bits(16) * 360d / 65536 : 0;
        return new(Part(), Part(), Part());
    }
    public static Vec3 Spawn(BitReader r, Vec3 fallback) => r.Bits(1) == 0 ? fallback : r.Bits(1) != 0 ? Read(r) : new(r.Float(), r.Float(), r.Float());
    public static (Vec3 Location, Vec3 Velocity) Movement(BitReader r)
    {
        if (r.Bits(2) != 0) throw new UnsupportedFieldException("Unvalidated movement flags");
        var location = Read(r, 100, 30);
        if (r.Bits(1) != 0) r.Bits(8);
        return (location, Read(r, 1, 16));
    }
}
