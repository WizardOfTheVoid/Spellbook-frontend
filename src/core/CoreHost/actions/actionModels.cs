using CoreHost.Models;

namespace CoreHost.Actions;

public sealed record AppTarget(int ProcessId, string WindowHandle);
public sealed record CoreActionRequest(string Id, string Key, string Author, string Priority,
    AppTarget App, IReadOnlyList<CoreCommand> Commands);
public sealed record CoreCommand(string Type, string? Command = null, string? ConsoleKey = null,
    int DelayMs = 0, bool ExpectClipboard = false, bool RestoreClipboard = true,
    IReadOnlyList<KeySequenceEntry>? Presses = null, int? MinimumIdleMs = null);
public sealed record CommandOutcome(bool Sent, object? Data = null, string? ErrorCode = null,
    string? ErrorMessage = null, bool Paused = false, IReadOnlyList<string>? Warnings = null);
public sealed record ActionSummary(string Id, string Status, int SentCommands, string? ErrorCode);
public sealed record QueueSnapshot(string State, int PendingActions, string? Id, string? Author,
    string? Priority, int Cursor, int CommandCount, long? RemainingMs, string? Reason, ActionSummary? LastResult);

public sealed class QueuedAction(CoreActionRequest request, long deadline, CancellationToken cancellation)
{
    public CoreActionRequest Request { get; } = request;
    public long Deadline { get; } = deadline;
    public CancellationToken Cancellation { get; } = cancellation;
    internal CancellationTokenSource DebugCancellation { get; } = new();
    internal volatile bool DebugCancelRequested;
    internal bool Cancelled => DebugCancelRequested || Cancellation.IsCancellationRequested;
    public GameProcessInfo? Game { get; internal set; }
    public int Cursor { get; internal set; }
    public int KeyCursor { get; set; }
    public bool DelayComplete { get; set; }
    public long DelayRemainingMs { get; set; } = -1;
    public int? FailedCommandIndex { get; internal set; }
    public List<string> Warnings { get; } = [];
    public string? PauseReason { get; internal set; }
    public List<CommandOutcome> Results { get; } = [];
    internal TaskCompletionSource<ConsoleExecutionResult> Completion { get; } =
        new(TaskCreationOptions.RunContinuationsAsynchronously);
}
