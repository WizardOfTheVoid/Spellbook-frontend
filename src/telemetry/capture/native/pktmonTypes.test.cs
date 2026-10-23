using System.Runtime.InteropServices;
namespace SpellBook.Telemetry;
public class PktmonTypesTests
{
    [Fact] public void StreamMetadataUsesPackedDriverLayout()
    {
        var type = typeof(PktmonApi).Assembly.GetType("SpellBook.Telemetry.PktmonTypes+Metadata")!;
        Assert.Equal(40, Marshal.SizeOf(type));
        Assert.Equal(32, Marshal.OffsetOf(type, "Timestamp").ToInt32());
    }
}
