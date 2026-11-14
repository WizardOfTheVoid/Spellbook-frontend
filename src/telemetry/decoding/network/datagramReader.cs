using System.Buffers.Binary;
using System.Net;
namespace SpellBook.Telemetry;
public record GameDatagram(string Direction, byte[] Payload, string ConnectionKey);
public static class DatagramReader
{
    public static GameDatagram? Read(PacketEnvelope packet, Endpoint endpoint)
    {
        var b = packet.Bytes.AsSpan();
        var start = packet.LinkKind switch { 1 => 14, 101 or 228 => 0, _ => -1 };
        if (start == 14 && b.Length >= 18 && BinaryPrimitives.ReadUInt16BigEndian(b[12..]) == 0x8100) start = 18;
        if (start < 0 || b.Length < start + 20 || b[start] >> 4 != 4 || b[start + 9] != 17) return null;
        var header = (b[start] & 15) * 4;
        var total = BinaryPrimitives.ReadUInt16BigEndian(b[(start + 2)..]);
        if (header < 20 || total < header + 8 || start + total > b.Length) throw new InvalidDataException("Truncated IP packet");
        if ((BinaryPrimitives.ReadUInt16BigEndian(b[(start + 6)..]) & 0x3fff) != 0) throw new UnsupportedFieldException("Fragmented IP datagram");
        var udp = start + header;
        var length = BinaryPrimitives.ReadUInt16BigEndian(b[(udp + 4)..]);
        if (length < 8 || udp + length > start + total) throw new InvalidDataException("Truncated UDP packet");
        var source = new IPAddress(b.Slice(start + 12, 4)).ToString();
        var dest = new IPAddress(b.Slice(start + 16, 4)).ToString();
        var sourcePort = BinaryPrimitives.ReadUInt16BigEndian(b[udp..]);
        var destPort = BinaryPrimitives.ReadUInt16BigEndian(b[(udp + 2)..]);
        var incoming = source == endpoint.Host && sourcePort == endpoint.Port;
        var outgoing = dest == endpoint.Host && destPort == endpoint.Port;
        if (!incoming && !outgoing) return null;
        return new(incoming ? "fromServer" : "toServer", b.Slice(udp + 8, length - 8).ToArray(), incoming ? $"{dest}:{destPort}" : $"{source}:{sourcePort}");
    }
}
