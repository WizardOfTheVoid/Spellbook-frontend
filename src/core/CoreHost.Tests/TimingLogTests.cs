using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class TimingLogTests
{
    [Fact]
    public void WriteDoesNotEmitCoreTimingWhenDebugIsDisabled()
    {
        var originalOutput = Console.Out;
        using var output = new StringWriter();

        try
        {
            Console.SetOut(output);
            new TimingLog().Write("core-focus-timing", "requestId=request-1");
        }
        finally
        {
            Console.SetOut(originalOutput);
        }

        Assert.Empty(output.ToString());
    }

    [Fact]
    public void FormatAggregatesRepeatedStagesInFirstSeenOrder()
    {
        var line = TimingLog.Format(
            "core-focus-timing",
            ["requestId=request-1", "leg=focus-game", "attempts=2"],
            [
                new KeyValuePair<string, double>("threadLookup", 0.1254),
                new KeyValuePair<string, double>("set", 1.5),
                new KeyValuePair<string, double>("threadLookup", 0.1254)
            ],
            totalMs: 2.8756);

        Assert.Equal(
            "[core-focus-timing] requestId=request-1 leg=focus-game attempts=2 threadLookup=0.251ms set=1.5ms total=2.876ms",
            line);
    }

    [Fact]
    public void FormatOmitsEmptyFieldsAndStages()
    {
        var line = TimingLog.Format(
            "core-command-timing",
            ["requestId=request-2", "", "path=cache-hit"],
            [
                new KeyValuePair<string, double>("gateWait", 0),
                new KeyValuePair<string, double>("", 10)
            ],
            totalMs: 0.099);

        Assert.Equal(
            "[core-command-timing] requestId=request-2 path=cache-hit gateWait=0ms total=0.099ms",
            line);
    }
}
