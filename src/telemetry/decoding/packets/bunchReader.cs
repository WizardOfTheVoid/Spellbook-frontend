namespace SpellBook.Telemetry;
public record Bunch(int Channel, string? Name, bool Open, bool Close, bool Reliable, int Sequence, bool Exports, bool MustMap, bool Partial, bool Initial, bool Final, BitReader Data, int? CloseReason = null);
public static class BunchReader
{
    public static Bunch Read(BitReader r, int packetSequence)
    {
        var control = r.Bits(1) != 0;
        var opened = control && r.Bits(1) != 0;
        var closed = control && r.Bits(1) != 0;
        int? closeReason = closed ? r.Int(15) : null;
        r.Bits(1);
        var reliable = r.Bits(1) != 0;
        var channel = checked((int)r.Packed());
        if (channel >= 32768) throw new InvalidDataException("Channel out of bounds");
        var exports = r.Bits(1) != 0;
        var mustMap = r.Bits(1) != 0;
        var partial = r.Bits(1) != 0;
        var sequence = reliable ? (int)r.Bits(10) : partial ? packetSequence : 0;
        var initial = partial && r.Bits(1) != 0;
        var final = partial && r.Bits(1) != 0;
        string? name = null;
        if (opened || reliable)
        {
            if (r.Bits(1) != 0) name = r.Packed() switch { 102 => "Actor", 255 => "Control", 256 => "Voice", var n => $"EName:{n}" };
            else { name = UnrealStrings.Read(r, 128); r.Bits(32); }
        }
        var data = r.Fork(r.Int(8192));
        return new(channel, name, opened, closed, reliable, sequence, exports, mustMap, partial, initial, final, data, closeReason);
    }
}
