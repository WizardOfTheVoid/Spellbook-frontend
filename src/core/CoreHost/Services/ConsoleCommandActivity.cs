namespace CoreHost.Services;

public sealed class ConsoleCommandActivity(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly object sync = new();
    private SentCommand[] recentCommands = [];
    private readonly Queue<SubmittedCommand> submissions = new();
    private readonly string streamId = Guid.NewGuid().ToString("N");
    private long sequence;

    public void Record(string command, ConsoleSubmissionContext? context = null)
    {
        lock (sync)
        {
            recentCommands = [new SentCommand(command, clock.GetTimestamp()), .. recentCommands.Take(2)];
            if (context is null) return;
            submissions.Enqueue(new(new(++sequence, command, clock.GetUtcNow(), 0, context.ActionId,
                context.CommandIndex, context.Author, context.AppProcessId, context.GameProcessId), clock.GetTimestamp()));
            while (submissions.Count > 1024) submissions.Dequeue();
        }
    }

    public ConsoleCommandHistory readCommands(long after)
    {
        lock (sync)
        {
            var oldest = submissions.TryPeek(out var first) ? first.Receipt.Sequence : 0;
            var now = clock.GetTimestamp();
            return new(streamId, sequence, oldest, after > sequence || oldest > 0 && after < oldest - 1,
                submissions.Where(item => item.Receipt.Sequence > after).Select(item => item.Receipt with {
                    AgeMs = (long)clock.GetElapsedTime(item.Timestamp, now).TotalMilliseconds
                }).ToArray());
        }
    }

    public ConsoleCommandActivitySnapshot? GetSnapshot() => GetRecentSnapshots().FirstOrDefault();

    public ConsoleCommandActivitySnapshot[] GetRecentSnapshots()
    {
        lock (sync)
        {
            var now = clock.GetTimestamp();
            return recentCommands.Select(command => new ConsoleCommandActivitySnapshot(command.Command,
                (long)clock.GetElapsedTime(command.Timestamp, now).TotalMilliseconds)).ToArray();
        }
    }

    private sealed record SentCommand(string Command, long Timestamp);
    private sealed record SubmittedCommand(ConsoleCommandReceipt Receipt, long Timestamp);
}

public sealed record ConsoleCommandActivitySnapshot(string Command, long TimeSinceMs);
public sealed record ConsoleSubmissionContext(string ActionId, int CommandIndex, string Author, int AppProcessId, int GameProcessId);
public sealed record ConsoleCommandReceipt(long Sequence, string Command, DateTimeOffset SubmittedAtUtc, long AgeMs,
    string ActionId, int CommandIndex, string Author, int AppProcessId, int GameProcessId);
public sealed record ConsoleCommandHistory(string StreamId, long Sequence, long OldestSequence, bool EventsLost,
    IReadOnlyList<ConsoleCommandReceipt> Commands);
