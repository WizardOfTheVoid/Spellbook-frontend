namespace SpellBook.Telemetry;
public static class ActorProperties
{
    public static Dictionary<uint, (string Name, Func<object?> Read)> Create(BitReader r, NetGuidCache cache) => new()
    {
        [1] = ("hidden", () => r.Bits(1) != 0), [2] = ("replicateMovement", () => r.Bits(1) != 0),
        [3] = ("tearOff", () => r.Bits(1) != 0), [4] = ("canBeDamaged", () => r.Bits(1) != 0),
        [5] = ("remoteRole", () => r.Bits(2)), [6] = ("replicatedMovement", () => NetVectors.Movement(r).Location),
        [7] = ("attachParentGuid", () => cache.Load(r)), [8] = ("attachmentLocation", () => NetVectors.Read(r, 100, 30)),
        [9] = ("attachmentScale", () => NetVectors.Read(r, 100, 30)), [10] = ("attachmentRotation", () => NetVectors.Rotation(r)),
        [11] = ("attachmentSocket", () => UnrealStrings.Name(r)), [12] = ("attachComponentGuid", () => cache.Load(r)),
        [13] = ("ownerGuid", () => cache.Load(r)), [14] = ("role", () => r.Bits(2)), [15] = ("instigatorGuid", () => cache.Load(r))
    };
}
