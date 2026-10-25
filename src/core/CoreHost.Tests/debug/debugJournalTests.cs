using CoreHost.Debug;

namespace CoreHost.Tests.Debug;

public sealed class DebugJournalTests
{
    [Fact]
    public void boundedJournalReportsGapsAndNeverReusesSequenceIds()
    {
        var journal = new DebugJournal(() => 42, capacity: 3);
        for (var index = 0; index < 5; index++) journal.record("test", $"event {index}");
        var snapshot = journal.read(1);
        Assert.True(snapshot.EventsLost);
        Assert.Equal(new long[] { 3, 4, 5 }, snapshot.Events.Select(item => item.Sequence));
        Assert.All(snapshot.Events, item => Assert.Equal(42, item.TimeMs));
        Assert.False(journal.read(3).EventsLost);
        Assert.Equal(new long[] { 4, 5 }, journal.read(3).Events.Select(item => item.Sequence));
        Assert.Empty(journal.read(5).Events);
        Assert.Equal(5, journal.read(5).Sequence);
    }
}
