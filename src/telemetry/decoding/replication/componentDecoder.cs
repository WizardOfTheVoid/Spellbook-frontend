namespace SpellBook.Telemetry;

public static class ComponentDecoder
{
    public static string? Kind(string path) => path.Split('.').Last() switch
    {
        "Stats" or "StatsComponent" => "stats",
        "Inventory" => "inventory",
        "CombatStateComponent0" => "combat",
        "AbilitiesComponent" => "abilities",
        "CombatStateQueue" => "combatQueue",
        _ => null
    };

    public static void Read(string direction, int channel, uint actorGuid, uint objectGuid, string path, string? ownerKind,
        bool replication, BitReader block, long ordinal, NetGuidCache cache, List<DecodedRecord> output, bool provisional)
    {
        var kind = Kind(path);
        if (kind is null) return;
        ObservationSource Source(int start, int end, string coverage, int? id = null) =>
            new(direction, channel, actorGuid, objectGuid, path, start, end, block.SizeBits, ordinal, coverage, id, Convert.ToBase64String(block.Data));
        void Unsupported(string detail, int start) => output.Add(new("decoderUnsupported", channel, actorGuid,
            Detail: detail, Direction: direction, Evidence: Source(start, block.SizeBits, "opaque")));
        if (replication && direction == "fromServer")
        {
            if (kind is not ("stats" or "inventory" or "combat")) { Unsupported($"No {kind} property profile", 0); return; }
            var property = ReplicationReader.Read(block, kind, cache);
            if (property.Fields.Count > 0)
                output.Add(new("properties", channel, actorGuid, Fields: property.Fields, Detail: ownerKind ?? "unknown", Direction: direction,
                    Provisional: provisional, Evidence: Source(0, property.ConsumedBits, property.Complete ? "observedProfile" : "partial")));
            if (!property.Complete) { Unsupported(property.StopReason ?? "Unknown component suffix", property.ConsumedBits); return; }
        }
        if (block.Remaining == 0) return;
        var maximum = kind switch { "stats" => 14, "combat" => 24, "abilities" => 10, "combatQueue" => 7, _ => 0 };
        if (maximum == 0) { Unsupported($"No {kind} RPC framing profile", block.Position); return; }
        try
        {
            foreach (var field in RpcReader.Read(block, maximum))
            {
                try
                {
                    var decoded = kind == "stats" && direction == "fromServer"
                        ? StatsNotifications.Read(field.Id, field.Data)
                        : CombatNotifications.Read(kind, field.Id, direction, field.Data, cache);
                    if (decoded is not { } value) { Unsupported($"Unknown {kind} RPC {field.Id}", field.StartBit); continue; }
                    output.Add(new(value.Kind, channel, actorGuid, Fields: value.Fields, Detail: ownerKind ?? "unknown", Direction: direction,
                        Provisional: provisional, Evidence: Source(field.StartBit, block.Position, "observedProfile", field.Id)));
                }
                catch (Exception ex) when (ex is IOException or InvalidDataException or ArgumentException or OverflowException)
                {
                    Unsupported($"{kind} RPC {field.Id}: {ex.Message}", field.StartBit);
                }
            }
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or ArgumentException or OverflowException)
        {
            Unsupported($"{kind} RPC framing: {ex.Message}", block.Position);
        }
    }
}
