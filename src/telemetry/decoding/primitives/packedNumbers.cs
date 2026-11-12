namespace SpellBook.Telemetry;
public static class PackedNumbers
{
    public static uint Read(BitReader reader) => reader.Packed();
}
