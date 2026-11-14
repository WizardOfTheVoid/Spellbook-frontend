namespace SpellBook.Telemetry;
public sealed class DecodingOrchestrator(Endpoint endpoint)
{
    private NetGuidCache cache = new();
    private ChannelTracker channels = new();
    private PartialBunchAssembler partials = new();
    private string? connectionKey;
    private ActorChannelDecoder? actorDecoder;
    public IReadOnlyList<DecodedRecord> Accept(PacketEnvelope packet)
    {
        var result = new List<DecodedRecord>();
        try
        {
            if (packet.LossCount > 0)
            {
                channels = new(); partials = new(); cache = new(); actorDecoder = null;
                result.Add(new("captureGap", 0, Detail: $"Lost {packet.LossCount} packets; identity continuity reset"));
            }
            var datagram = DatagramReader.Read(packet, endpoint);
            if (datagram is null) return result;
            if (connectionKey is not null && connectionKey != datagram.ConnectionKey)
            {
                channels = new(); partials = new(); cache = new(); actorDecoder = null;
                result.Add(new("captureGap", 0, Detail: "Capture loss or connection changed; identity continuity reset"));
            }
            connectionKey = datagram.ConnectionKey;
            foreach (var bunch in PacketHeaderReader.Read(datagram))
            {
                foreach (var ordered in channels.Order(datagram.Direction, bunch, packet.Ordinal).ToArray())
                {
                    try { (actorDecoder ??= new(cache, channels, partials)).Apply(datagram.Direction, ordered.Bunch, ordered.Ordinal, result, packet.Ordinal); }
                    catch (Exception ex) when (ex is IOException or InvalidDataException or ArgumentException or OverflowException)
                    { result.Add(new("decoderUnsupported", bunch.Channel, Detail: $"Actor framing at packet {packet.Ordinal}: {ex.Message}")); }
                }
            }
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or ArgumentException or OverflowException)
        { result.Add(new("decoderUnsupported", 0, Detail: $"Packet framing at {packet.Ordinal}: {ex.Message}")); }
        for (var i = 0; i < result.Count; i++)
            if (result[i].Evidence is { } evidence) result[i] = result[i] with { Evidence = evidence with { ConnectionKey = connectionKey } };
        return result;
    }
    public IReadOnlyList<DecodedRecord> Complete() => partials.Count == 0 ? [] : [new("decoderUnsupported", 0, Detail: $"Incomplete partial bunches: {partials.Count}")];
}
