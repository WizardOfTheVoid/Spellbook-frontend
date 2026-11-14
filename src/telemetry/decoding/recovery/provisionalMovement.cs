namespace SpellBook.Telemetry;

public record ProvisionalBlock(PropertyResult? Properties, IReadOnlyList<(int Id, MovementResult Movement)> Movements);

public static class ProvisionalMovement
{
    public static ProvisionalBlock Read(string direction, bool replication, BitReader data, ChannelState state, long ordinal)
    {
        var reader = new BitReader(data.Data, data.SizeBits);
        var scratch = new NetGuidCache();
        PropertyResult? properties = null;
        if (replication && direction == "fromServer")
        {
            properties = ReplicationReader.Read(reader, "pawn", scratch);
            if (properties.Fields.GetValueOrDefault("playerStateGuid") is uint guid) state.PlayerStateGuid = guid;
            if (!properties.Complete) return new(properties, []);
        }
        var movements = new List<(int, MovementResult)>();
        try
        {
            var fields = RpcReader.Read(reader, 96).ToArray();
            foreach (var field in fields)
            {
                if (direction == "fromServer" ? field.Id != 73 : field.Id is not (32 or 33)) continue;
                var movement = RpcDecoderRegistry.Read(direction, field.Id, field.Data, scratch);
                if (movement?.Location is { IsFinite: true }) movements.Add((field.Id, movement));
            }
        }
        catch (Exception ex) when (ex is IOException or ArgumentException or InvalidDataException or OverflowException)
        {
            return new(properties, []);
        }
        if (movements.Count > 0 && state.MovementPackets.Count < 3) state.MovementPackets.Add(ordinal);
        state.ProvisionalPawn |= state.MovementPackets.Count >= 3;
        return new(properties, movements);
    }
}
