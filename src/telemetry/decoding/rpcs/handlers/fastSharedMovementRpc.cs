namespace SpellBook.Telemetry;
public static class FastSharedMovementRpc
{
    public static MovementResult Read(BitReader r)
    {
        if (r.Bits(1) == 0) throw new UnsupportedFieldException("Fast shared parameter absent");
        var movement = NetVectors.Movement(r);
        return new(movement.Location, 0, r.Remaining);
    }
}
