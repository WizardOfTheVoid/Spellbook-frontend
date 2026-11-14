using System.Numerics;
namespace SpellBook.Telemetry;
public static class PacketHeaderReader
{
    public static IReadOnlyList<Bunch> Read(GameDatagram datagram)
    {
        var p = datagram.Payload;
        if (p.Length == 0 || p[^1] == 0) throw new InvalidDataException("Missing packet terminator");
        var bits = (p.Length - 1) * 8 + BitOperations.Log2(p[^1]) + 1;
        if (bits < 2 || ((p[(bits - 2) / 8] >> ((bits - 2) % 8)) & 1) == 0) throw new UnsupportedFieldException("Handshake or unknown packet format");
        var r = new BitReader(p, bits - 2) { Position = datagram.Direction == "fromServer" ? 10 : 42 };
        var packed = r.Bits(32);
        var sequence = (int)(packed >> 18 & 0x3fff);
        var history = (int)(packed & 15) + 1;
        if (history > 8) throw new InvalidDataException("Invalid packet history");
        r.Skip(history * 32);
        if (r.Bits(1) != 0) { r.Bits(10); if (r.Bits(1) != 0 && datagram.Direction == "fromServer") r.Bits(8); }
        var result = new List<Bunch>();
        while (r.Remaining > 0)
        {
            if (result.Count >= 256) throw new InvalidDataException("Too many bunches");
            result.Add(BunchReader.Read(r, sequence));
        }
        return result;
    }
}
