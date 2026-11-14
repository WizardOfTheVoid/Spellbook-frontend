using System.Text;
namespace SpellBook.Telemetry;
public static class UnrealStrings
{
    public static string Read(BitReader reader, int limit = 65536)
    {
        var length = (int)reader.Bits(32);
        if (length == 0) return "";
        if (length == int.MinValue || Math.Abs(length) > limit) throw new InvalidDataException("String length out of bounds");
        var width = length < 0 ? 2 : 1;
        var bytes = reader.Bytes(Math.Abs(length) * width);
        if (bytes[^1] != 0 || (width == 2 && bytes[^2] != 0)) throw new InvalidDataException("Unterminated string");
        Encoding encoding = width == 2 ? new UnicodeEncoding(false, false, true) : new UTF8Encoding(false, true);
        return encoding.GetString(bytes, 0, bytes.Length - width);
    }
    public static string Name(BitReader reader) => reader.Bits(1) != 0 ? $"Name:{reader.Packed()}" : $"{Read(reader)}:{reader.Bits(32)}";
}
