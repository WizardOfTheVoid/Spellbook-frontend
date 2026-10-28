namespace SpellBook.Telemetry;

public static class ItemMovement
{
    public static Vec3 Read(BitReader reader)
    {
        if (reader.Bits(2) != 0) throw new UnsupportedFieldException("Unvalidated item movement flags");
        var location = NetVectors.Read(reader, 1, 20);
        for (var axis = 0; axis < 3; axis++)
            if (reader.Bits(1) != 0) reader.Bits(8);
        var velocity = NetVectors.Read(reader, 1, 20);
        if (!location.IsFinite || !velocity.IsFinite) throw new InvalidDataException("Nonfinite item movement");
        return location;
    }
}
