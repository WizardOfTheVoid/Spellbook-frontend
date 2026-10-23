namespace SpellBook.Telemetry;
public record RpcField(int Id, int StartBit, BitReader Data);
public static class RpcReader
{
    public static IEnumerable<RpcField> Read(BitReader r, int maximum)
    {
        var count = 0;
        while (r.Remaining > 0)
        {
            if (++count > 20) throw new InvalidDataException("RPC field limit");
            var start = r.Position;
            var id = r.Int(maximum);
            var data = r.Fork(checked((int)r.Packed()));
            yield return new(id, start, data);
        }
    }
}
