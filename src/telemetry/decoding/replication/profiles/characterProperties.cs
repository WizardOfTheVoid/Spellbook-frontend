namespace SpellBook.Telemetry;
public static class CharacterProperties
{
    public static void Add(Dictionary<uint, (string, Func<object?>)> d, BitReader r, NetGuidCache cache)
    {
        d[19] = ("movementBaseGuid", () => cache.Load(r)); d[20] = ("movementBaseBone", () => UnrealStrings.Name(r));
        d[21] = ("basedLocation", () => NetVectors.Read(r, 100, 30)); d[22] = ("basedRotation", () => NetVectors.Rotation(r));
        var bools = new Dictionary<uint, string> { [23] = "serverHasBase", [24] = "relativeRotation", [25] = "serverHasVelocity", [30] = "crouched", [31] = "jumpForceApplied", [34] = "rootMotionActive", [41] = "rootRelativePosition", [42] = "rootRelativeRotation" };
        foreach (var (id, name) in bools) d[id] = (name, () => r.Bits(1) != 0);
        foreach (var id in new uint[] { 26,27,28,32,36 }) d[id] = ($"characterFloat{id}", () => r.Float());
        foreach (var id in new uint[] { 29,46 }) d[id] = ($"characterByte{id}", () => r.Bits(8));
        foreach (var id in new uint[] { 33,47 }) d[id] = ($"characterInt{id}", () => r.Bits(32));
        d[35] = ("rootMontageGuid", () => cache.Load(r)); d[37] = ("rootLocation", () => NetVectors.Read(r, 100, 30));
        d[38] = ("rootRotation", () => NetVectors.Rotation(r)); d[39] = ("rootBaseGuid", () => cache.Load(r));
        d[40] = ("rootBaseBone", () => UnrealStrings.Name(r));
        d[44] = ("rootAcceleration", () => NetVectors.Read(r)); d[45] = ("rootVelocity", () => NetVectors.Read(r));
    }
}
