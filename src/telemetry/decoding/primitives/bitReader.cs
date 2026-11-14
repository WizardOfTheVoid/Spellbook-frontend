using System.Numerics;
namespace SpellBook.Telemetry;
public sealed class BitReader(byte[] data, int? sizeBits = null)
{
    public byte[] Data { get; } = data;
    public int SizeBits { get; } = sizeBits ?? data.Length * 8;
    public int Position { get; set; }
    public int Remaining => SizeBits - Position;
    public ulong Bits(int count)
    {
        if (count < 0 || count > 64 || count > Remaining || Position < 0) throw new InvalidDataException("Bit overflow");
        ulong value = 0;
        for (var i = 0; i < count; i++) value |= (ulong)((Data[(Position + i) / 8] >> ((Position + i) % 8)) & 1) << i;
        Position += count;
        return value;
    }
    public void Skip(int count) => Position = checked(Position + count <= SizeBits ? Position + count : throw new InvalidDataException("Bit overflow"));
    public uint Packed()
    {
        ulong value = 0;
        for (var shift = 0; shift <= 28; shift += 7)
        {
            var b = Bits(8);
            value |= (b >> 1) << shift;
            if ((b & 1) == 0) return value <= uint.MaxValue ? (uint)value : throw new InvalidDataException("Packed uint overflow");
        }
        throw new InvalidDataException("Packed uint too long");
    }
    public int Int(int maximum)
    {
        var value = 0;
        for (var mask = 1; value + mask < maximum; mask <<= 1) value |= (int)Bits(1) * mask;
        return value;
    }
    public byte[] Bytes(int count) => Enumerable.Range(0, count).Select(_ => (byte)Bits(8)).ToArray();
    public float Float() => BitConverter.Int32BitsToSingle((int)Bits(32));
    public BitReader Fork(int bits)
    {
        if (bits < 0 || bits > Remaining || bits > DecoderProfile.MaxPartialBytes * 8) throw new InvalidDataException("Field length out of bounds");
        var bytes = new byte[(bits + 7) / 8];
        for (var i = 0; i < bits; i++) bytes[i / 8] |= (byte)(Bits(1) << (i % 8));
        return new(bytes, bits);
    }
}
