namespace SpellBook.Telemetry;
public record PropertyResult(Dictionary<string, object?> Fields, bool Complete, int ConsumedBits, string? StopReason);
public static class ReplicationReader
{
    public static PropertyResult Read(BitReader reader, string kind, NetGuidCache cache)
    {
        var fields = new Dictionary<string, object?>();
        var consumed = reader.Position;
        try
        {
            if (reader.Bits(1) != 0) throw new UnsupportedFieldException("Property checksums");
            var registry = PropertyDecoderRegistry.Create(kind, reader, cache);
            uint previous = 0;
            while (reader.Remaining > 0)
            {
                var handle = reader.Packed();
                if (handle == 0) return new(fields, true, reader.Position, null);
                if (handle <= previous) throw new InvalidDataException("Property order");
                if (!registry.TryGetValue(handle, out var decoder)) throw new UnsupportedFieldException($"No {kind} schema for property {handle} at bit {reader.Position}");
                var value = decoder.Read();
                if (value is float f && !float.IsFinite(f)) throw new InvalidDataException("Nonfinite property");
                fields[decoder.Name] = value;
                consumed = reader.Position; previous = handle;
            }
            throw new InvalidDataException("Missing property terminator");
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or ArgumentException)
        {
            return new(fields, false, consumed, ex is UnsupportedFieldException ? ex.Message : "Invalid property encoding");
        }
    }
}
