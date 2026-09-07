namespace CoreHost.Services;

public sealed class ConsoleCommandActivity(TimeProvider? timeProvider = null)
{
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private SentCommand? lastCommand;

    public void Record(string command) => Volatile.Write(ref lastCommand, new SentCommand(command, clock.GetTimestamp()));

    public ConsoleCommandActivitySnapshot? GetSnapshot()
    {
        var last = Volatile.Read(ref lastCommand);
        return last is null ? null : new(last.Command, (long)clock.GetElapsedTime(last.Timestamp).TotalMilliseconds);
    }

    private sealed record SentCommand(string Command, long Timestamp);
}

public sealed record ConsoleCommandActivitySnapshot(string Command, long TimeSinceMs);
