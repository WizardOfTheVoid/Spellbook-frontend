namespace SpellBook.Telemetry;
public record ActorSpawn(uint ActorGuid, uint ArchetypeGuid, Vec3? Location, bool Destroyed, bool? LocationPresent = null);
public static class SpawnReader
{
    public static ActorSpawn Read(BitReader r, NetGuidCache cache, bool closing)
    {
        var actor = cache.Load(r);
        if (closing && r.Remaining == 0) return new(actor, 0, null, true);
        if (actor == 0 || (actor & 1) != 0) return new(actor, 0, null, false);
        var archetype = cache.Load(r);
        cache.Load(r);
        var locationPresent = r.Bits(1) != 0;
        Vec3? location = !locationPresent ? null : r.Bits(1) != 0 ? NetVectors.Read(r) : new(r.Float(), r.Float(), r.Float());
        if (location is { IsFinite: false }) throw new InvalidDataException("Nonfinite spawn location");
        if (r.Bits(1) != 0) NetVectors.Rotation(r);
        NetVectors.Spawn(r, new(1, 1, 1));
        NetVectors.Spawn(r, new());
        return new(actor, archetype, location, false, locationPresent);
    }
}
