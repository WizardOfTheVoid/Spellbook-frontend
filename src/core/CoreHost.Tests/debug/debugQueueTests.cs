using CoreHost.Actions;
using CoreHost.Debug;
using CoreHost.Execution;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace CoreHost.Tests.Debug;

public sealed class DebugQueueTests
{
    [Theory]
    [InlineData("failed", "INPUT_FAILED")]
    [InlineData("cancelled", "ACTION_CANCELLED")]
    [InlineData("expired", "ACTION_EXPIRED")]
    public async Task anUnsubmittedTerminalCommandConsumesItsStep(string outcome, string error)
    {
        long now = 0;
        var queue = new ActionQueue();
        var runtime = new Runtime
        {
            Execute = (_, _) =>
            {
                if (outcome == "cancelled") queue.control("cancel", "attempt");
                if (outcome == "expired") { now = 1000; throw new OperationCanceledException(); }
                return Task.FromResult(new CommandOutcome(false, ErrorCode: "INPUT_FAILED"));
            }
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => now);
        var attempted = queue.enqueue(request("attempt"), 0, 1000, 10, TestContext.Current.CancellationToken);
        var waiting = queue.enqueue(request("waiting"), 0, 10000, 10, TestContext.Current.CancellationToken);
        queue.control("step");
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Equal(error, (await attempted).ErrorCode);
        runtime.Execute = null;
        await worker.step(TestContext.Current.CancellationToken);
        Assert.False(waiting.IsCompleted);
        Assert.Single(runtime.Commands);
        Assert.Equal(0, queue.debugSnapshot(now).Actions[0].Cursor);
        queue.control("step");
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Equal(1, queue.debugSnapshot(now).Actions[0].Cursor);
    }

    [Fact]
    public async Task cancellingAnIdBeforeAdmissionRejectsDelayedAndRepeatedSubmissionsOnlyForThatId()
    {
        var queue = new ActionQueue();
        Assert.True(queue.control("cancel", "delayed"));
        var delayed = queue.enqueue(request("delayed"), 0, 10000, 10, TestContext.Current.CancellationToken);
        Assert.True(delayed.IsCompleted);
        Assert.Equal("ACTION_CANCELLED", (await delayed).ErrorCode);
        Assert.Empty(queue.debugSnapshot(0).Actions);
        Assert.True(queue.control("cancel", "delayed"));
        Assert.Equal("ACTION_CANCELLED", (await queue.enqueue(request("delayed"), 0, 10000, 10, TestContext.Current.CancellationToken)).ErrorCode);
        Assert.False(queue.enqueue(request("unrelated"), 0, 10000, 10, TestContext.Current.CancellationToken).IsCompleted);
    }

    [Fact]
    public async Task cancellingASteppedActionDuringPreparationDoesNotReleaseTheNextAction()
    {
        var queue = new ActionQueue();
        var cancelled = queue.enqueue(request("preparing"), 0, 10000, 10, TestContext.Current.CancellationToken);
        _ = queue.enqueue(request("waiting"), 0, 10000, 10, TestContext.Current.CancellationToken);
        queue.control("step");
        var active = queue.take(0, _ => true)!;
        Assert.True(queue.control("cancel", "preparing", out var found));
        Assert.True(found);
        queue.pause(active, "WINDOW_NOT_READY");
        Assert.Equal("ACTION_CANCELLED", (await cancelled).ErrorCode);
        Assert.Null(queue.take(0, _ => true));
    }

    [Fact]
    public void rememberedCancellationsExpireAndRemainBounded()
    {
        long now = 0;
        var cancellations = new ActionCancellations(() => now, capacity: 2, lifetimeMs: 100);
        cancellations.remember("oldest");
        now = 1;
        cancellations.remember("second");
        now = 2;
        cancellations.remember("third");
        Assert.False(cancellations.contains("oldest"));
        Assert.True(cancellations.contains("second"));
        Assert.True(cancellations.contains("third"));
        now = 101;
        Assert.False(cancellations.contains("second"));
        Assert.True(cancellations.contains("third"));
        now = 102;
        Assert.False(cancellations.contains("third"));
    }

    [Fact]
    public async Task pauseAndStepKeepReadinessAndTheOriginalDeadline()
    {
        long now = 0;
        var journal = new DebugJournal(() => now);
        var queue = new ActionQueue(journal);
        var runtime = new Runtime { Allowed = false };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => now, journal);
        var completion = queue.enqueue(request("normal"), now, 1000, 10, TestContext.Current.CancellationToken);
        var high = queue.enqueue(request("high") with { Priority = "high" }, now, 1000, 10, TestContext.Current.CancellationToken);
        queue.control("pause");
        await worker.step(TestContext.Current.CancellationToken);
        queue.control("step");
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Empty(runtime.Commands);
        runtime.Allowed = true;
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Equal(new[] { "first" }, runtime.Commands);
        Assert.Equal(1, runtime.Cleanups);
        Assert.True(queue.debugSnapshot(now).Paused);
        Assert.Equal(1, queue.debugSnapshot(now).Actions[0].Cursor);
        Assert.Equal(2, queue.debugSnapshot(now).Actions.Count);
        Assert.Equal("second", queue.debugSnapshot(now).Actions[0].Commands[1].Command);
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Single(runtime.Commands);
        now = 1000;
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Equal("ACTION_EXPIRED", (await completion).ErrorCode);
        Assert.Equal("ACTION_EXPIRED", (await high).ErrorCode);
        Assert.Empty(queue.debugSnapshot(now).Actions);
    }

    [Fact]
    public async Task pauseDuringCommandWaitsForCleanupAndResumeNeverReplaysSubmission()
    {
        var journal = new DebugJournal();
        var queue = new ActionQueue(journal);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runtime = new Runtime { Execute = async (submitted, token) => { submitted(); entered.SetResult(); await release.Task.WaitAsync(token); return new(true); } };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0, journal);
        var completion = queue.enqueue(request("a"), 0, 10000, 10, TestContext.Current.CancellationToken);
        var processing = worker.step(TestContext.Current.CancellationToken);
        await entered.Task;
        queue.control("pause");
        Assert.Equal(0, runtime.Cleanups);
        Assert.False(completion.IsCompleted);
        release.SetResult();
        await processing;
        Assert.Equal(1, runtime.Cleanups);
        Assert.Equal(1, queue.debugSnapshot(0).Actions[0].Cursor);
        runtime.Execute = null;
        queue.control("resume");
        await worker.step(TestContext.Current.CancellationToken);
        Assert.True((await completion).Ok);
        Assert.Equal(new[] { "first", "second" }, runtime.Commands);
        var events = journal.read(0).Events;
        Assert.True(events.Single(item => item.Kind == "command_submitted" && item.CommandIndex == 0).Sequence <
            events.First(item => item.Kind == "phase" && item.Message == "cleanup").Sequence);
        Assert.Equal("idle", journal.execution.Phase);
    }

    [Fact]
    public async Task cancellationPreservesSentProgressAndDoesNotCloseAdmission()
    {
        var queue = new ActionQueue();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runtime = new Runtime { Execute = async (submitted, token) => { submitted(); entered.SetResult(); await Task.Delay(Timeout.Infinite, token); return new(true); } };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var completion = queue.enqueue(request("a"), 0, 10000, 10, TestContext.Current.CancellationToken);
        var processing = worker.step(TestContext.Current.CancellationToken);
        await entered.Task;
        Assert.True(queue.control("cancel", "a"));
        await processing;
        var result = await completion;
        Assert.Equal("ACTION_CANCELLED", result.ErrorCode);
        Assert.Equal(1, JsonSerializer.SerializeToElement(result.Data).GetProperty("sentCommands").GetInt32());
        Assert.Equal(1, runtime.Cleanups);
        Assert.Single(runtime.Commands);
        var next = queue.enqueue(request("b"), 0, 10000, 10, TestContext.Current.CancellationToken);
        queue.control("stop");
        Assert.Equal("ACTION_CANCELLED", (await next).ErrorCode);
        Assert.False(queue.enqueue(request("c"), 0, 10000, 10, TestContext.Current.CancellationToken).IsCompleted);
    }

    [Fact]
    public async Task cancellingAPartialKeySequenceReportsTheAlreadySentPresses()
    {
        var queue = new ActionQueue();
        var completion = queue.enqueue(request("keys") with { Commands = [new("keys", Presses: [new(78, 10), new(78, 10)])] },
            0, 10000, 10, TestContext.Current.CancellationToken);
        var active = queue.take(0, _ => true)!;
        active.KeyCursor = 1;
        Assert.Equal(1, queue.debugSnapshot(0).Actions[0].KeyCursor);
        queue.pause(active, "KEYBOARD_ACTIVE");
        queue.control("cancel", "keys");
        var data = JsonSerializer.SerializeToElement((await completion).Data);
        Assert.Equal(0, data.GetProperty("sentCommands").GetInt32());
        Assert.Equal(1, data.GetProperty("partialCommandKeyPresses").GetInt32());
    }

    private static CoreActionRequest request(string id) => new(id, id, "user", "normal", new(1, "0x1"),
        [new("console", "first", "NumpadSubtract"), new("console", "second", "NumpadSubtract")]);

    private sealed class Runtime : IActionRuntime
    {
        internal bool Allowed = true;
        internal int Cleanups;
        internal List<string> Commands = [];
        internal Func<Action, CancellationToken, Task<CommandOutcome>>? Execute;
        public void refresh() { }
        public ExecutionEligibility eligibility(CoreActionRequest action) => new(Allowed, Allowed ? null : "WINDOW_NOT_READY");
        public Task<OperationResult> prepare(QueuedAction action, CancellationToken token) => Task.FromResult(OperationResult.Success());
        public Task<CommandOutcome> execute(QueuedAction action, CoreCommand command, Action submitted, CancellationToken token)
        {
            Commands.Add(command.Command!);
            if (Execute is not null) return Execute(submitted, token);
            submitted();
            return Task.FromResult(new CommandOutcome(true));
        }
        public Task<IReadOnlyList<string>> cleanup(CancellationToken token) { Cleanups++; return Task.FromResult<IReadOnlyList<string>>([]); }
    }
    private sealed class Monitor : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue { get; } = new();
        public CoreHostOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
