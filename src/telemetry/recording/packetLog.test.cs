namespace SpellBook.Telemetry;
public class PacketLogTests
{
    [Fact] public void RetainsCaptureClockAndLossForReprocessing()
    {
        var root = TestWorkspace.Create();
        try
        {
            var utc = DateTimeOffset.Parse("2026-10-19T20:00:00Z");
            using (var log = new PacketLog(root,1024*1024)) log.Append(new(45,1234567,utc,1,3,[1,2,3],7));
            var packet = Assert.Single(PacketLog.Read(Directory.GetFiles(root).Single()));
            Assert.Equal(45,packet.Ordinal);
            Assert.Equal(1234567,packet.ElapsedUs);
            Assert.Equal(7,packet.LossCount);
            Assert.Equal(utc,packet.Timestamp);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root,true); }
    }
}
