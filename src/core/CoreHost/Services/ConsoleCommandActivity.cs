namespace CoreHost.Services;

public sealed class ConsoleCommandActivity(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private readonly object sync = new();
    private SentCommand[] recentCommands = [];

    public void Record(string command)
    {
        lock (sync)
            recentCommands = [new SentCommand(command, clock.GetTimestamp()), .. recentCommands.Take(2)];
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
}

public sealed record ConsoleCommandActivitySnapshot(string Command, long TimeSinceMs);
