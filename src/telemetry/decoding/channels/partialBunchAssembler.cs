namespace SpellBook.Telemetry;
public sealed class PartialBunchAssembler
{
    private readonly Dictionary<(string, int), Bunch> partials = [];
    private int retainedBytes;
    private void Remove((string,int) key)
    {
        if (partials.Remove(key,out var old)) retainedBytes -= (old.Data.SizeBits + 7) / 8;
    }
    private void Store((string,int) key,Bunch value)
    {
        Remove(key);
        var size = (value.Data.SizeBits + 7) / 8;
        if (size > DecoderProfile.MaxPartialBytes || partials.Count >= 128 || retainedBytes + size > 8 * 1024 * 1024) throw new InvalidDataException("Partial assembly budget exceeded");
        partials[key] = value; retainedBytes += size;
    }
    public int Count => partials.Count;
    public Bunch? Accept(string direction, Bunch bunch)
    {
        if (!bunch.Partial) return bunch;
        var key = (direction, bunch.Channel);
        if (bunch.Initial) Store(key,bunch);
        else
        {
            if (!partials.TryGetValue(key, out var previous)) throw new InvalidDataException("Missing initial partial");
            var modulus = bunch.Reliable ? 1024 : 16384;
            var delta = (bunch.Sequence - previous.Sequence + modulus) % modulus;
            if (previous.Reliable != bunch.Reliable || delta != 1 && (bunch.Reliable || delta != 0)) { Remove(key); throw new InvalidDataException("Partial sequence gap"); }
            var length = previous.Data.SizeBits + bunch.Data.SizeBits;
            if (length > DecoderProfile.MaxPartialBytes * 8) { Remove(key); throw new InvalidDataException("Partial too large"); }
            var bytes = new byte[(length + 7) / 8];
            var position = 0;
            foreach (var data in new[] { previous.Data, bunch.Data })
                for (var bit = 0; bit < data.SizeBits; bit++, position++) bytes[position / 8] |= (byte)(((data.Data[bit / 8] >> (bit % 8)) & 1) << (position % 8));
            Store(key,previous with { Sequence = bunch.Sequence, MustMap = bunch.MustMap, Close = bunch.Close, CloseReason = bunch.CloseReason, Data = new(bytes, length) });
        }
        if (!bunch.Final) return null;
        var result = partials[key]; Remove(key);
        return result;
    }
}
