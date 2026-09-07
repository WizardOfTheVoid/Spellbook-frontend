namespace CoreHost.Services;

public sealed class ConsoleOpenAttemptState
{
    private int _mayBeOpen;
    private int _commandSubmitted;

    public bool MayBeOpen => Volatile.Read(ref _mayBeOpen) != 0;

    public bool CommandSubmitted => Volatile.Read(ref _commandSubmitted) != 0;

    internal void MarkInputSent()
    {
        Volatile.Write(ref _mayBeOpen, 1);
    }

    internal void MarkCommandSubmitted()
    {
        Volatile.Write(ref _commandSubmitted, 1);
    }
}
