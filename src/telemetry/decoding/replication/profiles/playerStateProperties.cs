namespace SpellBook.Telemetry;
public static class PlayerStateProperties
{
    public static void Add(Dictionary<uint, (string, Func<object?>)> d, BitReader r, NetGuidCache cache)
    {
        d[16] = ("score", () => r.Float()); d[17] = ("playerId", () => r.Bits(32)); d[18] = ("ping", () => r.Bits(8));
        var bools = new[] { "fromPreviousLevel", "isBot", "isInactive", "isSpectator", "onlySpectator" };
        for (uint i = 0; i < bools.Length; i++) d[19 + i] = (bools[i], () => r.Bits(1) != 0);
        d[24] = ("startTime", () => r.Bits(32)); d[25] = ("uniqueId", () => UniqueNetIds.Read(r));
        d[26] = ("playerName", () => UnrealStrings.Read(r)); d[44] = ("playFabIdentity", () => UniqueNetIds.Read(r));
        d[45] = ("platformIdentity", () => UniqueNetIds.Read(r));
        for (uint i = 46; i <= 51; i++) d[i] = ($"playerCounter{i}", () => r.Bits(32));
        d[27] = ("statCodes27", () => ComponentProperties.Sparse(r, () => (uint)r.Bits(32), 4096));
        d[28] = ("statCodes28", () => ComponentProperties.Sparse(r, () => (uint)r.Bits(32), 4096));
        foreach (uint handle in new uint[] { 29, 42, 52, 59, 63, 64 })
            d[handle] = ($"profileReference{handle}", () => cache.Load(r));
        d[40] = ("profileFlag40", () => r.Bits(1) != 0);
        d[41] = ("profileFlag41", () => r.Bits(1) != 0);
        d[53] = ("profileString53", () => UnrealStrings.Read(r));
        d[55] = ("profileCode55", () => r.Bits(7));
        d[60] = ("profileCode60", () => r.Bits(3));
        for (uint i = 66; i <= 69; i++)
            d[i] = ($"customization{i}", () => ComponentProperties.Sparse(r, () =>
            {
                var count = (int)r.Bits(8);
                return Enumerable.Range(0, count).Select(_ => (ushort)r.Bits(16)).ToArray();
            }, 4096));
        for (uint i = 71; i <= 86; i++) d[i] = ($"profileFloat{i}", () => r.Float());
        for (uint i = 87; i <= 93; i++) d[i] = ($"nextSpawnLoadout{i}", () => cache.Load(r));
        d[95] = ("profileFloat95", () => r.Float());
        d[98] = ("profileCode98", () => r.Bits(4));
    }
}
