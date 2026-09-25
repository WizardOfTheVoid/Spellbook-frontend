using CoreHost.Execution;
using CoreHost.Options;
using Microsoft.Extensions.Options;
using CoreHost.Debug;

namespace CoreHost.Actions;

public sealed class ActionWorker(ActionQueue queue, IActionRuntime runtime, IOptionsMonitor<CoreHostOptions> options,
    Func<long>? clock = null, DebugJournal? journal = null) : BackgroundService
{
    private long now => clock?.Invoke() ?? Environment.TickCount64;

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        queue.stop();
        await base.StopAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await step(stoppingToken);
                await Task.Delay(options.CurrentValue.Queue.RecheckMs, stoppingToken);
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        finally { queue.stop(); }
    }

    public async Task step(CancellationToken stoppingToken)
    {
        runtime.refresh();
        var action = queue.take(now, request =>
        {
            var state = runtime.eligibility(request);
            queue.blocked(request.Id, state.Reason);
            return state.Allowed || state.Unavailable;
        });
        if (action is null) return;
        var status = "completed";
        string? reason = null;
        string? message = null;
        int? commandIndex = null;
        CommandOutcome? commandResult = null;
        using var lifetime = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken, action.Cancellation, action.DebugCancellation.Token);
        lifetime.CancelAfter(TimeSpan.FromMilliseconds(Math.Max(1, action.Deadline - now)));
        try
        {
            lifetime.Token.ThrowIfCancellationRequested();
            var eligibility = runtime.eligibility(action.Request);
            if (eligibility.Unavailable) { status = "cancelled"; reason = eligibility.Reason; }
            else if (!eligibility.Allowed) { status = "paused"; reason = eligibility.Reason; }
            else
            {
                journal?.phase("preparing", action.Request.Id, action.Cursor);
                var prepared = await runtime.prepare(action, lifetime.Token);
                if (!prepared.Ok)
                {
                    status = prepared.ErrorCode == "GAME_SESSION_CHANGED" ? "cancelled" : prepared.ErrorCode is "WINDOW_NOT_READY" or "WINDOW_TARGET_CHANGED" or "WINDOW_NOT_FOUND" or
                        "FOCUS_FAILED" or "FOREGROUND_VERIFY_FAILED" ? "paused" : "failed";
                    reason = prepared.ErrorCode;
                    message = prepared.ErrorMessage;
                }
                else while (action.Cursor < action.Request.Commands.Count)
                {
                    lifetime.Token.ThrowIfCancellationRequested();
                    eligibility = runtime.eligibility(action.Request);
                    if (!eligibility.Allowed)
                    {
                        status = eligibility.Unavailable ? "cancelled" : "paused";
                        reason = eligibility.Reason;
                        break;
                    }
                    var index = action.Cursor;
                    var command = action.Request.Commands[index];
                    var remainingDelay = action.DelayComplete ? 0 : action.DelayRemainingMs >= 0 ? action.DelayRemainingMs : command.DelayMs;
                    if (remainingDelay >= action.Deadline - now)
                    {
                        status = "expired";
                        reason = "ACTION_EXPIRED";
                        message = "The remaining Command delay cannot finish before the Action expires.";
                        break;
                    }
                    if (!queue.beginCommand(action)) { status = "paused"; reason = "MANUAL_PAUSE"; break; }
                    commandIndex = index;
                    commandResult = null;
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token);
                    timeout.CancelAfter(TimeSpan.FromMilliseconds(remainingDelay + options.CurrentValue.Queue.CommandTimeoutMs));
                    journal?.phase("executing", action.Request.Id, index);
                    CommandOutcome result;
                    try { result = await runtime.execute(action, command,
                        () => queue.submitted(action, new CommandOutcome(true)), timeout.Token); }
                    finally { queue.endCommand(); }
                    if (result.Paused && result.Sent && result.Data is null && command.Type == "console" &&
                        (command.ExpectClipboard || string.Equals(command.Command, "ListPlayers", StringComparison.OrdinalIgnoreCase)))
                        result = result with { Paused = false, ErrorCode = "OUTPUT_INTERRUPTED", ErrorMessage = "Command submitted, but required clipboard output was interrupted." };
                    commandResult = result;
                    queue.outcome(action, index, result);
                    lifetime.Token.ThrowIfCancellationRequested();
                    if (result.Paused) { status = "paused"; reason = result.ErrorCode; break; }
                    if (result.ErrorCode is not null) { status = result.ErrorCode == "GAME_SESSION_CHANGED" ? "cancelled" : "failed"; reason = result.ErrorCode; message = result.ErrorMessage; break; }
                    if (!result.Sent) { status = "failed"; reason = "COMMAND_NOT_SUBMITTED"; break; }
                    commandIndex = null;
                }
            }
        }
        catch (OperationCanceledException)
        {
            var cancelled = action.Cancelled || stoppingToken.IsCancellationRequested;
            var expired = !cancelled && (lifetime.IsCancellationRequested || now >= action.Deadline);
            status = cancelled ? "cancelled" : expired ? "expired" : "failed";
            reason = cancelled ? "ACTION_CANCELLED" : expired ? "ACTION_EXPIRED" : "COMMAND_TIMEOUT";
        }
        catch (Exception exception) { status = "failed"; reason = "EXECUTION_FAILED"; message = exception.Message; }
        finally
        {
            journal?.phase("cleanup", action.Request.Id, commandIndex);
            using var cleanup = new CancellationTokenSource(options.CurrentValue.Window.FocusTimeoutMs + 1000);
            try { action.Warnings.AddRange(await runtime.cleanup(cleanup.Token)); }
            catch (Exception exception) { action.Warnings.Add($"CLEANUP_FAILED: {exception.Message}"); }
        }
        if (commandIndex is { } failedIndex && status is "failed" or "expired" or "cancelled")
        {
            var result = commandResult ?? new CommandOutcome(action.Cursor > failedIndex);
            queue.outcome(action, failedIndex, result with { ErrorCode = reason, ErrorMessage = message ?? result.ErrorMessage, Paused = false });
        }
        if (status == "paused" && action.Cursor == action.Request.Commands.Count) status = "completed";
        if (status == "paused") queue.pause(action, reason ?? "INPUT_ACTIVE");
        else queue.finish(action, status, reason, message);
        journal?.phase("idle");
    }
}
