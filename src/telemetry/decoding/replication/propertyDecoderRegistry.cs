namespace SpellBook.Telemetry;
public class UnsupportedFieldException(string message) : IOException(message);
public static class PropertyDecoderRegistry
{
    public static Dictionary<uint, (string Name, Func<object?> Read)> Create(string kind, BitReader reader, NetGuidCache cache)
    {
        if (kind is "stats" or "inventory" or "combat") return ComponentProperties.Create(kind, reader);
        var result = ActorProperties.Create(reader, cache);
        if (kind == "item") result[6] = ("replicatedMovement", () => ItemMovement.Read(reader));
        if (kind == "pawn") PawnProperties.Add(result, reader, cache);
        if (kind == "playerState") PlayerStateProperties.Add(result, reader, cache);
        return result;
    }
}
