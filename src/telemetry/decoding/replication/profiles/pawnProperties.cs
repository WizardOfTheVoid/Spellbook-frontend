namespace SpellBook.Telemetry;
public static class PawnProperties
{
    public static void Add(Dictionary<uint, (string, Func<object?>)> d, BitReader r, NetGuidCache cache)
    {
        d[16] = ("remoteViewPitch", () => r.Bits(8)); d[17] = ("playerStateGuid", () => cache.Load(r));
        d[18] = ("controllerGuid", () => cache.Load(r));
        CharacterProperties.Add(d, r, cache);
    }
}
