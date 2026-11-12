namespace SpellBook.Telemetry;
public record ResolvedCoordinate(Vec3 Location, string Space, string Reason);
public sealed class BaseCoordinateResolver
{
    public ResolvedCoordinate Resolve(Vec3 raw, string source, uint baseGuid)
    {
        if (!raw.IsFinite) throw new InvalidDataException("Nonfinite coordinates");
        return source is "replicatedMovementProperty" or "fastSharedRpc73Prefix" || baseGuid == 0
            ? new(raw, "world", "Wire serializer reports world coordinates")
            : new(raw, "unknown", "Movement base mobility/transform is not established");
    }
}
