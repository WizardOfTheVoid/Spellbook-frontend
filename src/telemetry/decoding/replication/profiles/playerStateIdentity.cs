namespace SpellBook.Telemetry;
public static class PlayerStateIdentity
{
    public static UniqueNetId? ReadBoundedTail(BitReader block, int fromBit)
    {
        // Only called on a verified TBLPlayerState after a supported property prefix.
        // Require typed property 44 and the following ordered handle, not a name match.
        UniqueNetId? found = null;
        for (var bit = fromBit; bit + 120 < block.SizeBits; bit++)
        {
            if (((block.Data[bit / 8] >> (bit % 8)) & 1) != 0) continue;
            try
            {
                var r = new BitReader(block.Data,block.SizeBits) { Position = bit };
                if (r.Packed() != 44) continue;
                var id = UniqueNetIds.Read(r);
                if (id.Type != "PlayFab" || !Wire.IsPlayFabId(id.Id)) continue;
                var next = r.Packed();
                if (next == 45) { UniqueNetIds.Read(r); next = r.Packed(); }
                if (next != 0 && (next <= 45 || next > 512)) continue;
                if (found is not null && found.Id != id.Id) return null;
                found = id;
            }
            catch (Exception ex) when (ex is InvalidDataException or IOException or ArgumentException) { }
        }
        return found;
    }
}
