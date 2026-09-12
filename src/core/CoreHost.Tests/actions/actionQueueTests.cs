using CoreHost.Actions;
using System.Text.Json;

namespace CoreHost.Tests.Actions;

public sealed class ActionQueueTests
{
    private static CoreActionRequest action(string id, string key = "same", string priority = "normal", int commands = 2) =>
        new(id, key, "user", priority, new AppTarget(123, "0x0000000000000001"),
            Enumerable.Range(0, commands).Select(index => new CoreCommand("console", $"command{index}", "NumpadSubtract")).ToArray());

    [Fact]
    public async Task resumesFirstUnsentCommand()
    {
        var queue = new ActionQueue();
        var pending = queue.enqueue(action("a"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var entry = queue.take(0, _ => true)!;
        queue.submitted(entry, new CommandOutcome(true));
        queue.pause(entry, "KEYBOARD_ACTIVE");
        Assert.Equal(1, queue.take(100, _ => true)!.Cursor);
        queue.submitted(entry, new CommandOutcome(true));
        queue.finish(entry, "completed");
        var result = await pending;
        Assert.True(result.Ok);
        Assert.Equal(2, queue.snapshot(100).LastResult!.SentCommands);
    }

    [Fact]
    public async Task expiresFromEnqueueWithoutResettingOnPause()
    {
        var queue = new ActionQueue();
        var pending = queue.enqueue(action("a"), 100, 10000, 999, TestContext.Current.CancellationToken);
        var entry = queue.take(5000, _ => true)!;
        queue.submitted(entry, new CommandOutcome(true));
        queue.pause(entry, "KEYBOARD_ACTIVE");
        Assert.Null(queue.take(10100, _ => true));
        var result = await pending;
        Assert.Equal("ACTION_EXPIRED", result.ErrorCode);
        Assert.Equal(1, JsonSerializer.SerializeToElement(result.Data).GetProperty("sentCommands").GetInt32());
    }

    [Fact]
    public async Task blockedLoopSweepsAllExpiredActionsAndKeepsUnexpiredWork()
    {
        var queue = new ActionQueue();
        var results = new List<Task<CoreHost.Models.ConsoleExecutionResult>>();
        for (var now = 0; now < 20000; now += 250)
        {
            var id = $"loop-{now}";
            results.Add(queue.enqueue(action(id, id) with
            {
                Commands = [new CoreCommand("console", "ServerSay Dev test", "NumpadSubtract", DelayMs: 250)]
            }, now, 10000, 999, TestContext.Current.CancellationToken));
            Assert.Null(queue.take(now, _ => false));
            Assert.InRange(queue.snapshot(now).PendingActions, 1, 40);
        }

        Assert.Equal(40, results.Count(result => result.IsCompleted));
        Assert.Null(queue.take(25000, _ => false));
        Assert.Equal(19, queue.snapshot(25000).PendingActions);
        Assert.Equal(61, results.Count(result => result.IsCompleted));
        foreach (var result in results.Take(61)) Assert.Equal("ACTION_EXPIRED", (await result).ErrorCode);
        Assert.All(results.Skip(61), result => Assert.False(result.IsCompleted));
    }

    [Fact]
    public async Task supersedesOnlyMatchingWaitingWork()
    {
        var queue = new ActionQueue();
        var old = queue.enqueue(action("a"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var other = queue.enqueue(action("b", "other"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var next = queue.enqueue(action("c"), 10, 10000, 999, TestContext.Current.CancellationToken);
        Assert.Equal("ACTION_SUPERSEDED", (await old).ErrorCode);
        Assert.False(other.IsCompleted);
        Assert.False(next.IsCompleted);
        Assert.Equal("b", queue.take(20, _ => true)!.Request.Id);
    }

    [Fact]
    public void eligibleWorkCanPassBlockedWorkWithoutInterleaving()
    {
        var queue = new ActionQueue();
        _ = queue.enqueue(action("normal", "normal"), 0, 10000, 999, TestContext.Current.CancellationToken);
        _ = queue.enqueue(action("high", "high", "high"), 0, 10000, 999, TestContext.Current.CancellationToken);
        Assert.Equal("high", queue.take(1, request => request.Priority == "high")!.Request.Id);
        Assert.Null(queue.take(2, _ => true));
    }

    [Fact]
    public async Task capacityAndCancellationCompleteWaitingCallers()
    {
        var queue = new ActionQueue();
        using var cancellation = new CancellationTokenSource();
        var pending = queue.enqueue(action("a"), 0, 10000, 1, cancellation.Token);
        var rejected = await queue.enqueue(action("b", "different"), 0, 10000, 1, TestContext.Current.CancellationToken);
        Assert.Equal("QUEUE_FULL", rejected.ErrorCode);
        cancellation.Cancel();
        Assert.Null(queue.take(1, _ => true));
        Assert.Equal("ACTION_CANCELLED", (await pending).ErrorCode);
    }

    [Fact]
    public async Task activeWorkIsNotSupersededOrCompletedBeforeCleanup()
    {
        var queue = new ActionQueue();
        var pending = queue.enqueue(action("a"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var active = queue.take(1, _ => true)!;
        _ = queue.enqueue(action("b"), 2, 10000, 999, TestContext.Current.CancellationToken);
        queue.submitted(active, new CommandOutcome(true));
        Assert.False(pending.IsCompleted);
        queue.finish(active, "failed", "CLEANUP_FAILED");
        Assert.Equal(1, queue.snapshot(2).LastResult!.SentCommands);
        Assert.Equal("CLEANUP_FAILED", (await pending).ErrorCode);
    }

    [Fact]
    public async Task stopClosesAdmissionAndSettlesWaitingWorkWithoutCompletingActiveCleanup()
    {
        var queue = new ActionQueue();
        var running = queue.enqueue(action("active"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var entry = queue.take(0, _ => true)!;
        var waiting = queue.enqueue(action("waiting", "other"), 0, 10000, 999, TestContext.Current.CancellationToken);

        queue.stop();

        Assert.True(waiting.IsCompleted);
        Assert.Equal("CORE_STOPPED", (await waiting).ErrorCode);
        Assert.False(running.IsCompleted);
        var rejected = queue.enqueue(action("new", "new"), 1, 10000, 999, TestContext.Current.CancellationToken);
        Assert.True(rejected.IsCompleted);
        Assert.Equal("CORE_STOPPED", (await rejected).ErrorCode);
        queue.finish(entry, "cancelled", "ACTION_CANCELLED");
        Assert.Equal("ACTION_CANCELLED", (await running).ErrorCode);
        Assert.Equal(0, queue.snapshot(2).PendingActions);
    }

    [Fact]
    public async Task activeWorkYieldingAfterStopSettlesInsteadOfLeavingAnOrphanedWaiter()
    {
        var queue = new ActionQueue();
        var completion = queue.enqueue(action("active"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var active = queue.take(0, _ => true)!;
        queue.submitted(active, new CommandOutcome(true));
        queue.stop();
        queue.pause(active, "KEYBOARD_ACTIVE");
        Assert.True(completion.IsCompleted);
        Assert.Equal("CORE_STOPPED", (await completion).ErrorCode);
        Assert.Null(queue.take(1, _ => true));
    }

    [Fact]
    public async Task completedCommandResultsDoNotChangeWhenExecutionStateChangesLater()
    {
        var queue = new ActionQueue();
        var completion = queue.enqueue(action("active", commands: 1), 0, 10000, 999, TestContext.Current.CancellationToken);
        var active = queue.take(0, _ => true)!;
        queue.submitted(active, new CommandOutcome(true, new { value = "captured" }));
        queue.finish(active, "completed");
        var result = await completion;
        var before = JsonSerializer.Serialize(result.Data);
        active.Results.Clear();
        Assert.Equal(before, JsonSerializer.Serialize(result.Data));
    }

    [Fact]
    public async Task failedCaptureReportsTheSubmittedCommandIndexAndPreservesProgress()
    {
        var queue = new ActionQueue();
        var completion = queue.enqueue(action("active"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var active = queue.take(0, _ => true)!;
        queue.submitted(active, new CommandOutcome(true));
        queue.outcome(active, 0, new CommandOutcome(true, ErrorCode: "CLIPBOARD_TIMEOUT", ErrorMessage: "Output missing"));
        queue.finish(active, "failed", "CLIPBOARD_TIMEOUT");
        var data = JsonSerializer.SerializeToElement((await completion).Data, new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.Equal(1, data.GetProperty("sentCommands").GetInt32());
        Assert.Equal(0, data.GetProperty("failedCommandIndex").GetInt32());
        Assert.Equal("Output missing", data.GetProperty("commandResults")[0].GetProperty("errorMessage").GetString());
    }

    [Fact]
    public async Task cancelledSubmissionCannotReplaceExistingQueuedWork()
    {
        var queue = new ActionQueue();
        var original = queue.enqueue(action("original"), 0, 10000, 999, TestContext.Current.CancellationToken);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        var cancelled = queue.enqueue(action("cancelled"), 1, 10000, 999, cancellation.Token);
        Assert.True(cancelled.IsCompleted);
        Assert.Equal("ACTION_CANCELLED", (await cancelled).ErrorCode);
        Assert.False(original.IsCompleted);
        Assert.Equal("original", queue.take(2, _ => true)!.Request.Id);
    }
}
