using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class ConsoleCommandActivityTests
{
    [Fact]
    public void consoleReceiptsPreserveRepeatedSubmissionsAndExcludeKeys()
    {
        var time = new ManualTimeProvider();
        var activity = new ConsoleCommandActivity(time);
        var context = new ConsoleSubmissionContext("action", 0, "system", 11, 22);
        activity.Record("ListPlayers", context);
        time.Advance(TimeSpan.FromSeconds(2));
        activity.Record("ListPlayers", context with { CommandIndex = 1 });
        activity.Record("Key 65");

        var history = activity.readCommands(0);
        Assert.Equal(2, history.Sequence);
        Assert.Equal([1L, 2L], history.Commands.Select(command => command.Sequence));
        Assert.Equal([2000L, 0L], history.Commands.Select(command => command.AgeMs));
        Assert.Equal([0, 1], history.Commands.Select(command => command.CommandIndex));
        Assert.All(history.Commands, command => {
            Assert.Equal("ListPlayers", command.Command);
            Assert.Equal("system", command.Author);
            Assert.Equal(11, command.AppProcessId);
            Assert.Equal(22, command.GameProcessId);
        });
        Assert.Single(activity.readCommands(1).Commands);
        Assert.Empty(activity.readCommands(2).Commands);
        Assert.Equal("Key 65", activity.GetSnapshot()!.Command);
        Assert.Equal(3, activity.GetRecentSnapshots().Length);
    }

    [Fact]
    public void commandCursorReportsEvictionAndCoreLifetimeChanges()
    {
        var activity = new ConsoleCommandActivity();
        var context = new ConsoleSubmissionContext("action", 0, "user", 11, 22);
        var empty = activity.readCommands(0);
        Assert.Equal(0, empty.Sequence);
        Assert.Equal(0, empty.OldestSequence);
        Assert.False(empty.EventsLost);
        Assert.NotEqual(empty.StreamId, new ConsoleCommandActivity().readCommands(0).StreamId);
        for (var index = 0; index < 1026; index++) activity.Record($"command {index}", context);
        var history = activity.readCommands(0);
        Assert.Equal(1026, history.Sequence);
        Assert.Equal(3, history.OldestSequence);
        Assert.True(history.EventsLost);
        Assert.Equal(1024, history.Commands.Count);
        Assert.False(activity.readCommands(2).EventsLost);
        Assert.Equal(1026, Assert.Single(activity.readCommands(1025).Commands).Sequence);
        Assert.True(activity.readCommands(1027).EventsLost);
    }

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
