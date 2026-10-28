using System.Text;
namespace SpellBook.Telemetry;
public sealed class WireFixture
{
    private readonly List<int> bits = [];
    public WireFixture Bits(ulong value,int count) { for(var i=0;i<count;i++) bits.Add((int)(value>>i&1)); return this; }
    public WireFixture Packed(uint value)
    {
        do { var b=(value&127)<<1;value>>=7;Bits(b|(value>0?1u:0u),8); } while(value>0);
        return this;
    }
    public WireFixture Text(string text)
    {
        var bytes=Encoding.UTF8.GetBytes(text);Bits((uint)bytes.Length+1,32);foreach(var b in bytes)Bits(b,8);Bits(0,8);return this;
    }
    public WireFixture Identity(string id) => Bits(248,8).Text("PlayFab").Text(id);
    public BitReader Reader()
    {
        var bytes=new byte[(bits.Count+7)/8];for(var i=0;i<bits.Count;i++)bytes[i/8]|=(byte)(bits[i]<<(i%8));return new(bytes,bits.Count);
    }
}
