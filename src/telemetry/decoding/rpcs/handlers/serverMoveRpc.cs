namespace SpellBook.Telemetry;
public record MovementResult(Vec3? Location, uint BaseGuid, int RemainingBits);
public static class ServerMoveRpc
{
    public static MovementResult Read(int index, BitReader r, NetGuidCache cache)
    {
        T Optional<T>(Func<T> decode, T fallback) => r.Bits(1) != 0 ? decode() : fallback;
        float Time() => Optional(r.Float, 0f);
        Vec3 Accel() => Optional(() => NetVectors.Read(r), new Vec3());
        ulong Byte() => Optional(() => r.Bits(8), 0ul);
        ulong View() => Optional(() => r.Bits(32), 0ul);
        if (index == 33) { Time(); Accel(); Byte(); View(); }
        var time = Time(); Accel();
        if (!float.IsFinite(time) || time < 0 || time > 10000) throw new InvalidDataException("Invalid movement timestamp");
        if (index == 37) { Byte(); if (r.Remaining != 0) throw new InvalidDataException("Movement tail"); return new(null, 0, 0); }
        var location = Optional(() => NetVectors.Read(r, 100, 30), new Vec3());
        Byte(); Byte(); View();
        var baseGuid = Optional(() => cache.Load(r), 0u);
        Optional(() => UnrealStrings.Name(r), ""); Byte();
        if (r.Remaining != 0) throw new InvalidDataException("Movement tail");
        return new(location, baseGuid, 0);
    }
}
