using CoreHost.Debug;

namespace CoreHost.Tests.Debug;

public sealed class CpuUsageTests
{
    [Fact]
    public void measuresTotalProcessorCapacityAndCachesForOneSecond()
    {
        long now = 0;
        double milliseconds = 100;
        var cpu = new CpuUsage(() => milliseconds, () => now, processorCount: 4);
        Assert.Null(cpu.read());
        now = 1000;
        milliseconds = 1100;
        Assert.Equal(25, cpu.read());
        now = 1500;
        milliseconds = 2100;
        Assert.Equal(25, cpu.read());
        now = 2000;
        Assert.Equal(25, cpu.read());
    }
}
