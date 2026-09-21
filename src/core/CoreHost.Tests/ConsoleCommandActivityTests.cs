using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class ConsoleCommandActivityTests
{
    [Fact]
    public void ReportsElapsedTimeAndReplacesPreviousCommand()
    {
        var time = new ManualTimeProvider();
        var activity = new ConsoleCommandActivity(time);
        Assert.Null(activity.GetSnapshot());
        Assert.Empty(activity.GetRecentSnapshots());
        activity.Record("ListPlayers");
        time.Advance(TimeSpan.FromSeconds(2));
        Assert.Equal(new ConsoleCommandActivitySnapshot("ListPlayers", 2000), activity.GetSnapshot());
        activity.Record("ListPlayers");
        Assert.Equal(new ConsoleCommandActivitySnapshot("ListPlayers", 0), activity.GetSnapshot());
        time.Advance(TimeSpan.FromSeconds(1));
        Assert.Equal(new ConsoleCommandActivitySnapshot("ListPlayers", 1000), activity.GetSnapshot());
        activity.Record("Serversay hello");
        Assert.Equal(new ConsoleCommandActivitySnapshot("Serversay hello", 0), activity.GetSnapshot());
        Assert.Equal(new[] {
            new ConsoleCommandActivitySnapshot("Serversay hello", 0),
            new ConsoleCommandActivitySnapshot("ListPlayers", 1000),
            new ConsoleCommandActivitySnapshot("ListPlayers", 3000)
        }, activity.GetRecentSnapshots());
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private long timestamp;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => timestamp;
        public void Advance(TimeSpan duration) => timestamp += duration.Ticks;
    }
}
