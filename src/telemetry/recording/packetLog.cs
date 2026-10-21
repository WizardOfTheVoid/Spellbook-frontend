using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
namespace SpellBook.Telemetry;
public sealed class PacketLog(string root, long segmentSize) : IDisposable
{
    private record CaptureTiming(long Ordinal,long ElapsedUs,long LossCount);
    private const string TimingPrefix = "spellbook.telemetry.v1:";
    private FileStream? stream;
    private int segment;
    private readonly Dictionary<int, int> interfaces = [];
    public long Size { get; private set; }
    public (int Segment, long Offset) Append(PacketEnvelope packet)
    {
        if (stream is null || stream.Length + packet.Bytes.Length + 64 > segmentSize)
        {
            stream?.Dispose();
            Directory.CreateDirectory(root);
            stream = new FileStream(Path.Combine(root, $"{++segment:000000}.pcapng"), FileMode.CreateNew, FileAccess.Write, FileShare.Read);
            interfaces.Clear();
            Block(0x0a0d0d0a, w => { w.Write(0x1a2b3c4d); w.Write((ushort)1); w.Write((ushort)0); w.Write(-1L); });
        }
        if (!interfaces.TryGetValue(packet.LinkKind, out var index))
        {
            interfaces[packet.LinkKind] = index = interfaces.Count;
            Block(1, w => { w.Write((ushort)packet.LinkKind); w.Write((ushort)0); w.Write(65535); });
        }
        var offset = stream.Position;
        var timestamp = (ulong)((packet.Timestamp.UtcTicks - DateTimeOffset.UnixEpoch.Ticks) / 10);
        Block(6, w =>
        {
            w.Write(index); w.Write((uint)(timestamp >> 32)); w.Write((uint)timestamp); w.Write(packet.Bytes.Length); w.Write(packet.OriginalLength);
            w.Write(packet.Bytes); for (var i = 0; i < (4 - packet.Bytes.Length % 4) % 4; i++) w.Write((byte)0);
            var timing = Encoding.UTF8.GetBytes(TimingPrefix + Wire.Serialize(new CaptureTiming(packet.Ordinal,packet.ElapsedUs,packet.LossCount)));
            w.Write((ushort)1); w.Write((ushort)timing.Length); w.Write(timing);
            for (var i=0;i<(4-timing.Length%4)%4;i++) w.Write((byte)0);
            w.Write(0);
        });
        return (segment, offset);
    }
    private void Block(uint kind, Action<BinaryWriter> write)
    {
        using var body = new MemoryStream(); using var writer = new BinaryWriter(body);
        write(writer);
        using var output = new BinaryWriter(stream!, System.Text.Encoding.UTF8, true);
        var size = (uint)body.Length + 12;
        output.Write(kind); output.Write(size); output.Write(body.ToArray()); output.Write(size); Size += size;
    }
    public void Flush() => stream?.Flush(true);
    public void Dispose() { stream?.Dispose(); stream=null; }

    public static IEnumerable<PacketEnvelope> Read(string file, DateTimeOffset? start = null, bool recoverTail = false)
    {
        using var stream = File.Open(file, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var little = true;
        var interfaces = new List<(int Link, double Resolution)>();
        var ordinal = 0L;
        while (stream.Position < stream.Length)
        {
            var prefix = new byte[12];
            if (stream.ReadAtLeast(prefix, 12, false) != 12) { if (recoverTail) yield break; throw new InvalidDataException("Truncated PCAPNG block"); }
            var isSection = BinaryPrimitives.ReadUInt32LittleEndian(prefix) == 0x0a0d0d0a;
            if (isSection)
            {
                var magic = BinaryPrimitives.ReadUInt32LittleEndian(prefix.AsSpan(8));
                little = magic == 0x1a2b3c4d ? true : magic == 0x4d3c2b1a ? false : throw new InvalidDataException("Invalid PCAPNG byte order");
                interfaces.Clear();
            }
            uint U32(byte[] b, int offset) => little ? BinaryPrimitives.ReadUInt32LittleEndian(b.AsSpan(offset)) : BinaryPrimitives.ReadUInt32BigEndian(b.AsSpan(offset));
            ushort U16(byte[] b, int offset) => little ? BinaryPrimitives.ReadUInt16LittleEndian(b.AsSpan(offset)) : BinaryPrimitives.ReadUInt16BigEndian(b.AsSpan(offset));
            var length = U32(prefix, 4);
            if (length < 12 || length > 16 * 1024 * 1024 || length % 4 != 0) throw new InvalidDataException("PCAPNG block size");
            var bytes = new byte[length]; prefix.CopyTo(bytes, 0);
            if (stream.ReadAtLeast(bytes.AsSpan(12), (int)length - 12, false) != length - 12) { if (recoverTail) yield break; throw new InvalidDataException("Truncated PCAPNG tail"); }
            if (U32(bytes, (int)length - 4) != length) throw new InvalidDataException("PCAPNG block length mismatch");
            switch (U32(bytes, 0))
            {
                case 1:
                    if (length < 20 || interfaces.Count >= 128) throw new InvalidDataException("PCAPNG interface");
                    var resolution = 1_000_000d;
                    for (var at = 16; at + 4 <= length - 4;)
                    {
                        var code = U16(bytes, at); var count = U16(bytes, at + 2); at += 4;
                        if (code == 0) break;
                        if (at + count > length - 4) throw new InvalidDataException("PCAPNG interface option");
                        if (code == 9 && count == 1) resolution = (bytes[at] & 128) != 0 ? Math.Pow(2, bytes[at] & 127) : Math.Pow(10, bytes[at]);
                        at += (count + 3) & ~3;
                    }
                    interfaces.Add((U16(bytes, 8), resolution)); break;
                case 6:
                    if (length < 32 || U32(bytes, 8) >= interfaces.Count) throw new InvalidDataException("PCAPNG packet interface");
                    var source = interfaces[(int)U32(bytes, 8)];
                    var captured = U32(bytes, 20); var original = U32(bytes, 24);
                    if (captured > 65535 || captured > original || 28 + captured > length - 4) throw new InvalidDataException("PCAPNG packet size");
                    var stamp = ((ulong)U32(bytes, 12) << 32) | U32(bytes, 16);
                    var utc = DateTimeOffset.UnixEpoch.AddTicks((long)Math.Round(stamp / source.Resolution * TimeSpan.TicksPerSecond));
                    start ??= utc;
                    CaptureTiming? timing = null;
                    for (var at = 28 + ((int)captured + 3 & ~3); at + 4 <= length-4;)
                    {
                        var code=U16(bytes,at); var count=U16(bytes,at+2); at+=4;
                        if (code==0) break;
                        if (at+count>length-4) throw new InvalidDataException("PCAPNG packet option");
                        if (code==1 && count<4096)
                        {
                            var comment=Encoding.UTF8.GetString(bytes,at,count);
                            if (comment.StartsWith(TimingPrefix,StringComparison.Ordinal))
                            {
                                timing=JsonSerializer.Deserialize<CaptureTiming>(comment[TimingPrefix.Length..],Wire.Json);
                                if (timing is null || timing.ElapsedUs<0 || timing.Ordinal<0 || timing.LossCount<0) throw new InvalidDataException("Invalid capture timing");
                            }
                        }
                        at+=(count+3)&~3;
                    }
                    yield return new(timing?.Ordinal ?? ordinal++, timing?.ElapsedUs ?? Math.Max(0, (utc - start.Value).Ticks / 10), utc, source.Link, (int)original, bytes.AsSpan(28, (int)captured).ToArray(),timing?.LossCount ?? 0,timing is not null); break;
            }
        }
    }
}
