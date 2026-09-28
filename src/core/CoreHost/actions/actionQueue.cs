using CoreHost.Models;
using CoreHost.Debug;

namespace CoreHost.Actions;

public sealed class ActionQueue(DebugJournal? journal = null, Func<long>? clock = null)
{
    private readonly object sync = new();
    private readonly List<QueuedAction> pending = [];
    private readonly ActionCancellations cancellations = new(clock);
    private QueuedAction? active;
    private ActionSummary? lastResult;
    private bool stopped;
    private bool manualPaused, stepAvailable, commandExecuting;

    public CoreActionRequest? currentAction
    {
        get { lock (sync) return (active ?? pending.FirstOrDefault())?.Request; }
    }

    public Task<ConsoleExecutionResult> enqueue(CoreActionRequest request, long now, int lifetimeMs,
        int capacity, CancellationToken cancellation = default)
    {
        lock (sync)
        {
            if (stopped || cancellation.IsCancellationRequested || cancellations.contains(request.Id))
                return Task.FromResult(ActionResults.create(new(request, now, cancellation), "cancelled",
                    stopped ? "CORE_STOPPED" : "ACTION_CANCELLED", null));
            expire(now);
            foreach (var older in pending.Where(item => item != active && item.Request.Key == request.Key).ToArray())
                finish(older, "superseded", "ACTION_SUPERSEDED");
            if (pending.Count >= capacity)
                return Task.FromResult(ConsoleExecutionResult.Failure("QUEUE_FULL", "The Action queue is full.", request.Id, 429));
            var entry = new QueuedAction(request, checked(now + Math.Min(lifetimeMs, request.TtlMs ?? lifetimeMs)), cancellation);
            var index = request.Author == "user" ? pending.FindIndex(item => item.Request.Author == "system") : -1;
            if (index < 0) pending.Add(entry);
            else pending.Insert(index, entry);
            journal?.record("queued", "Action queued", request.Id);
            return entry.Completion.Task;
        }
    }

    public QueuedAction? take(long now, Func<CoreActionRequest, bool> eligible)
    {
        lock (sync)
        {
            if (stopped) return null;
            expire(now);
            if (active is not null) return null;
            if (manualPaused && !stepAvailable) return null;
            active = pending.FirstOrDefault(item => eligible(item.Request));
            if (active is not null)
            {
                active.PauseReason = null;
                journal?.record("running", "Action selected", active.Request.Id, active.Cursor);
            }
            return active;
        }
    }

    public void submitted(QueuedAction entry, CommandOutcome outcome)
    {
        lock (sync)
        {
            if (active != entry || entry.Cursor >= entry.Request.Commands.Count)
                throw new InvalidOperationException("Only the active Action can submit its next Command.");
            entry.Results.Add(outcome);
            journal?.record("command_submitted", "Command submitted", entry.Request.Id, entry.Cursor);
            entry.Cursor++;
            entry.KeyCursor = 0;
            entry.DelayComplete = false;
            entry.DelayRemainingMs = -1;
            if (manualPaused) stepAvailable = false;
        }
    }

    public void outcome(QueuedAction entry, int index, CommandOutcome result)
    {
        lock (sync)
        {
            if (!pending.Contains(entry) || index < 0) return;
            if (index < entry.Results.Count) entry.Results[index] = result;
            else if (result.ErrorCode is not null && !result.Paused) entry.Results.Add(result);
            if (result.ErrorCode is not null && !result.Paused) entry.FailedCommandIndex = index;
            journal?.record("command_result", result.ErrorCode ?? (result.Sent ? "submitted" : "not_submitted"), entry.Request.Id, index);
        }
    }

    public void pause(QueuedAction entry, string reason)
    {
        lock (sync)
        {
            if (active != entry) return;
            entry.PauseReason = reason;
            journal?.record("paused", reason, entry.Request.Id, entry.Cursor);
            if (stopped) finish(entry, "cancelled", "CORE_STOPPED");
            else if (entry.Cancelled) finish(entry, "cancelled", "ACTION_CANCELLED");
            else if (pending.Any(item => item != entry && item.Request.Key == entry.Request.Key))
                finish(entry, "superseded", "ACTION_SUPERSEDED");
            else active = null;
        }
    }

    public void finish(QueuedAction entry, string status, string? code = null, string? message = null)
    {
        lock (sync)
        {
            if (!pending.Remove(entry)) return;
            if (active == entry)
            {
                active = null;
                if (manualPaused) stepAvailable = false;
            }
            lastResult = new(entry.Request.Id, status, entry.Cursor, code);
            journal?.record(status, code ?? status, entry.Request.Id, entry.Cursor);
            entry.Completion.TrySetResult(ActionResults.create(entry, status, code, message));
        }
    }

    public void stop()
    {
        lock (sync)
        {
            stopped = true;
            foreach (var entry in pending.Where(item => item != active).ToArray())
                finish(entry, "cancelled", "CORE_STOPPED");
        }
    }

    public QueueSnapshot snapshot(long now)
    {
        lock (sync)
        {
            var current = active ?? pending.FirstOrDefault();
            return new(active is not null ? "running" : pending.Count > 0 ? "paused" : "idle",
                pending.Count, current?.Request.Id, current?.Request.Author, current?.Request.Priority,
                current?.Cursor ?? 0, current?.Request.Commands.Count ?? 0,
                current is null ? null : Math.Max(0, current.Deadline - now), current?.PauseReason, lastResult);
        }
    }

    public bool control(string operation, string? id = null) => control(operation, id, out _);

    public bool control(string operation, string? id, out bool found)
    {
        found = false;
        QueuedAction[] cancelled = [];
        lock (sync)
        {
            switch (operation)
            {
                case "pause": manualPaused = true; stepAvailable = false; break;
                case "resume": manualPaused = false; stepAvailable = false; break;
                case "step": manualPaused = true; stepAvailable = !commandExecuting; break;
                case "cancel":
                    if (string.IsNullOrWhiteSpace(id) || id.Length > 96) return false;
                    cancellations.remember(id);
                    cancelled = pending.Where(item => item.Request.Id == id).ToArray();
                    found = cancelled.Length > 0;
                    break;
                case "stop": cancelled = pending.ToArray(); stepAvailable = false; break;
                default: return false;
            }
            journal?.record("queue_control", operation, id);
            foreach (var entry in cancelled)
            {
                cancellations.remember(entry.Request.Id);
                entry.DebugCancelRequested = true;
            }
            foreach (var entry in cancelled.Where(item => item != active)) finish(entry, "cancelled", "ACTION_CANCELLED");
        }
        foreach (var entry in cancelled) entry.DebugCancellation.Cancel();
        return true;
    }

    public bool beginCommand(QueuedAction entry)
    {
        lock (sync)
        {
            if (entry.Cancelled) throw new OperationCanceledException();
            if (active != entry || manualPaused && !stepAvailable) return false;
            if (manualPaused) stepAvailable = false;
            commandExecuting = true;
            return true;
        }
    }

    public void endCommand() { lock (sync) commandExecuting = false; }

    public void blocked(string id, string? reason)
    {
        lock (sync)
        {
            var entry = pending.FirstOrDefault(item => item.Request.Id == id);
            if (entry is null || entry.PauseReason == reason) return;
            entry.PauseReason = reason;
            if (reason is not null) journal?.record("blocked", reason, id, entry.Cursor);
        }
    }

    public DebugQueueSnapshot debugSnapshot(long now)
    {
        lock (sync) return new(manualPaused, pending.Select(entry => new DebugQueueAction(entry.Request.Id,
            entry.Request.Key, entry.Request.Author, entry.Request.Priority, entry.Cursor, entry.Request.Commands.Count,
            Math.Max(0, entry.Deadline - now), entry == active ? "running" : manualPaused || entry.PauseReason is not null ? "paused" : "queued",
            entry == active ? null : manualPaused ? "MANUAL_PAUSE" : entry.PauseReason, entry.Request.Commands, entry.KeyCursor)).ToArray());
    }

    private void expire(long now)
    {
        foreach (var entry in pending.Where(item => item != active).ToArray())
        {
            if (entry.Cancelled) finish(entry, "cancelled", "ACTION_CANCELLED");
            else if (now >= entry.Deadline) finish(entry, "expired", "ACTION_EXPIRED");
        }
    }
}

public sealed record DebugQueueAction(string Id, string Key, string Author, string Priority, int Cursor,
    int CommandCount, long RemainingMs, string State, string? Reason, IReadOnlyList<CoreCommand> Commands, int KeyCursor);
public sealed record DebugQueueSnapshot(bool Paused, IReadOnlyList<DebugQueueAction> Actions);
