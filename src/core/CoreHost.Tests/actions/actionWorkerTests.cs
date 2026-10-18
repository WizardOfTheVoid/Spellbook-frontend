using CoreHost.Actions;
using CoreHost.Execution;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace CoreHost.Tests.Actions;

public sealed class ActionWorkerTests
{
    [Fact]
    public async Task interruptionResumesUnsentCommandAndCleansBeforeCompletion()
    {
        var queue = new ActionQueue();
        var runtime = new Runtime();
        var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var request = new CoreActionRequest("a", "a", "user", "normal", new(1, "0x1"),
            [new("console", "ban", "NumpadSubtract"), new("console", "announcement", "NumpadSubtract")]);
        var completion = queue.enqueue(request, 0, 10000, 999, TestContext.Current.CancellationToken);
        await worker.step(TestContext.Current.CancellationToken);
        Assert.False(completion.IsCompleted);
        Assert.Equal(1, runtime.Cleanups);
        runtime.Allowed = true;
        await worker.step(TestContext.Current.CancellationToken);
        Assert.True((await completion).Ok);
        Assert.Equal(new[] { "ban", "announcement" }, runtime.Commands);
        Assert.Equal(2, runtime.Cleanups);
    }

    [Fact]
    public async Task stoppingClosesAdmissionBeforeActiveCancellationCleanupCompletes()
    {
        var queue = new ActionQueue();
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var cleanupStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var cleanupRelease = new TaskCompletionSource<IReadOnlyList<string>>(TaskCreationOptions.RunContinuationsAsynchronously);
        var runtime = new Runtime
        {
            Execute = async (_, _, submitted, token) =>
            {
                submitted();
                entered.SetResult();
                await Task.Delay(Timeout.Infinite, token);
                return new(true);
            },
            Cleanup = async token =>
            {
                cleanupStarted.SetResult();
                return await cleanupRelease.Task.WaitAsync(token);
            }
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var running = queue.enqueue(request("active"), 0, 10000, 999, TestContext.Current.CancellationToken);
        await worker.StartAsync(TestContext.Current.CancellationToken);
        try
        {
            await entered.Task.WaitAsync(TimeSpan.FromSeconds(3), TestContext.Current.CancellationToken);
            var waiting = queue.enqueue(request("waiting"), 0, 10000, 999, TestContext.Current.CancellationToken);
            var stopping = worker.StopAsync(TestContext.Current.CancellationToken);
            await cleanupStarted.Task.WaitAsync(TimeSpan.FromSeconds(3), TestContext.Current.CancellationToken);
            Assert.True(waiting.IsCompleted);
            Assert.Equal("CORE_STOPPED", (await waiting).ErrorCode);
            Assert.False(running.IsCompleted);
            var rejected = queue.enqueue(request("new"), 0, 10000, 999, TestContext.Current.CancellationToken);
            Assert.True(rejected.IsCompleted);
            cleanupRelease.SetResult([]);
            await stopping.WaitAsync(TimeSpan.FromSeconds(3), TestContext.Current.CancellationToken);
            var result = await running;
            Assert.Equal("ACTION_CANCELLED", result.ErrorCode);
            Assert.Equal(1, data(result).GetProperty("sentCommands").GetInt32());
            Assert.Equal(0, data(result).GetProperty("failedCommandIndex").GetInt32());
        }
        finally
        {
            cleanupRelease.TrySetResult([]);
            await worker.StopAsync(TestContext.Current.CancellationToken);
        }
    }

    [Fact]
    public async Task commandTimeoutDoesNotMisreportAnUnexpiredActionAsExpired()
    {
        var queue = new ActionQueue();
        var runtime = new Runtime
        {
            Execute = async (_, _, _, token) =>
            {
                await Task.Delay(Timeout.Infinite, token);
                return new(false);
            }
        };
        var options = new Monitor();
        options.CurrentValue.Queue.CommandTimeoutMs = 1;
        using var worker = new ActionWorker(queue, runtime, options, () => 0);
        var completion = queue.enqueue(request("timeout"), 0, 10000, 999, TestContext.Current.CancellationToken);
        await worker.step(TestContext.Current.CancellationToken);
        var result = await completion;
        Assert.Equal("COMMAND_TIMEOUT", result.ErrorCode);
        Assert.Equal("failed", data(result).GetProperty("status").GetString());
        Assert.Equal(0, data(result).GetProperty("sentCommands").GetInt32());
    }

    [Fact]
    public async Task captureFailureAfterSubmissionKeepsItsOwnIndexAndNeverSendsTheNextCommand()
    {
        var queue = new ActionQueue();
        var sends = 0;
        var runtime = new Runtime
        {
            Execute = (_, _, submitted, _) =>
            {
                submitted();
                sends++;
                return Task.FromResult(new CommandOutcome(true, ErrorCode: "CLIPBOARD_TIMEOUT", ErrorMessage: "Output missing"));
            }
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var completion = queue.enqueue(request("capture"), 0, 10000, 999, TestContext.Current.CancellationToken);
        await worker.step(TestContext.Current.CancellationToken);
        var result = await completion;
        Assert.Equal("CLIPBOARD_TIMEOUT", result.ErrorCode);
        Assert.Equal(1, sends);
        Assert.Equal(1, runtime.Cleanups);
        Assert.Equal(1, data(result).GetProperty("sentCommands").GetInt32());
        Assert.Equal(0, data(result).GetProperty("failedCommandIndex").GetInt32());
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task interruptedRequiredOutputFailsWithoutReplayingSubmittedListPlayers(bool expectClipboard)
    {
        var queue = new ActionQueue();
        var sends = 0;
        var runtime = new Runtime
        {
            Execute = (_, _, submitted, _) =>
            {
                submitted();
                sends++;
                return Task.FromResult(new CommandOutcome(true, ErrorCode: "KEYBOARD_ACTIVE", Paused: true));
            }
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var command = new CoreCommand("console", "ListPlayers", "NumpadSubtract", ExpectClipboard: expectClipboard);
        var completion = queue.enqueue(request("capture") with { Commands = [command] }, 0, 10000, 999, TestContext.Current.CancellationToken);
        await worker.step(TestContext.Current.CancellationToken);
        var result = await completion;
        Assert.Equal("OUTPUT_INTERRUPTED", result.ErrorCode);
        Assert.Equal(1, data(result).GetProperty("sentCommands").GetInt32());
        Assert.Equal(0, data(result).GetProperty("failedCommandIndex").GetInt32());
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Equal(1, sends);
    }

    [Theory]
    [InlineData(-1, true)]
    [InlineData(0, false)]
    public async Task commandTimeoutAddsOnlyTheRemainingConfiguredDelay(long remainingDelay, bool shouldComplete)
    {
        var queue = new ActionQueue();
        var runtime = new Runtime
        {
            Execute = async (_, _, submitted, token) =>
            {
                await Task.Delay(150, token);
                submitted();
                return new(true);
            }
        };
        var options = new Monitor();
        options.CurrentValue.Queue.CommandTimeoutMs = 50;
        using var worker = new ActionWorker(queue, runtime, options, () => 0);
        var command = new CoreCommand("console", "announcement", "NumpadSubtract", DelayMs: 150);
        var completion = queue.enqueue(request("delay") with { Commands = [command] }, 0, 10000, 999, TestContext.Current.CancellationToken);
        var action = queue.take(0, _ => true)!;
        action.DelayRemainingMs = remainingDelay;
        queue.pause(action, "KEYBOARD_ACTIVE");
        await worker.step(TestContext.Current.CancellationToken);
        var result = await completion;
        Assert.Equal(shouldComplete, result.Ok);
        Assert.Equal(shouldComplete ? null : "COMMAND_TIMEOUT", result.ErrorCode);
    }

    [Fact]
    public async Task reopenedGateSkipsDelayThatCannotFitAndSendsTheNextViableAction()
    {
        long now = 0;
        var queue = new ActionQueue();
        var attempted = new List<string>();
        var runtime = new Runtime
        {
            Allowed = false,
            Prepare = (_, _) => { now += 30; return Task.FromResult(OperationResult.Success()); },
            Execute = (action, command, submitted, _) =>
            {
                attempted.Add(action.Request.Id);
                if (now + command.DelayMs >= action.Deadline)
                {
                    now = action.Deadline;
                    throw new OperationCanceledException();
                }
                now += command.DelayMs;
                submitted();
                return Task.FromResult(new CommandOutcome(true));
            }
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => now);
        CoreActionRequest loop(string id) => request(id) with
        {
            Commands = [new("console", "ServerSay Dev test", "NumpadSubtract", DelayMs: 250)]
        };
        var old = queue.enqueue(loop("old"), 0, 10000, 999, TestContext.Current.CancellationToken);
        var next = queue.enqueue(loop("next"), 250, 10000, 999, TestContext.Current.CancellationToken);
        now = 9890;
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Empty(attempted);

        runtime.Allowed = true;
        await worker.step(TestContext.Current.CancellationToken);
        await worker.step(TestContext.Current.CancellationToken);

        Assert.Equal("ACTION_EXPIRED", (await old).ErrorCode);
        Assert.True((await next).Ok);
        Assert.Equal(new[] { "next" }, attempted);
        Assert.Equal(0, queue.snapshot(now).PendingActions);
    }

    [Fact]
    public async Task actionLifetimeStillBoundsACommandWithPlannedDelay()
    {
        var queue = new ActionQueue();
        var runtime = new Runtime
        {
            Execute = async (_, _, _, token) =>
            {
                await Task.Delay(Timeout.Infinite, token);
                return new(false);
            }
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var command = new CoreCommand("console", "announcement", "NumpadSubtract", DelayMs: 10000);
        var completion = queue.enqueue(request("expiry") with { Commands = [command] }, 0, 10, 999, TestContext.Current.CancellationToken);
        await worker.step(TestContext.Current.CancellationToken);
        Assert.Equal("ACTION_EXPIRED", (await completion).ErrorCode);
    }

    [Theory]
    [InlineData("WINDOW_NOT_READY")]
    [InlineData("WINDOW_TARGET_CHANGED")]
    [InlineData("WINDOW_NOT_FOUND")]
    [InlineData("FOCUS_FAILED")]
    [InlineData("FOREGROUND_VERIFY_FAILED")]
    public async Task transientPreparationFailurePausesUntilTheSameUnsentCommandCanRun(string error)
    {
        var queue = new ActionQueue();
        var preparations = 0;
        var runtime = new Runtime
        {
            Prepare = (_, _) => Task.FromResult(++preparations == 1
                ? OperationResult.Failure(error, "Window state changed.") : OperationResult.Success())
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var completion = queue.enqueue(request("focus") with { Commands = [new("console", "once", "NumpadSubtract")] }, 0, 10000, 999, TestContext.Current.CancellationToken);

        await worker.step(TestContext.Current.CancellationToken);

        Assert.False(completion.IsCompleted);
        Assert.Empty(runtime.Commands);
        Assert.Equal(1, runtime.Cleanups);
        Assert.Equal(error, queue.snapshot(0).Reason);
        Assert.Equal(0, queue.snapshot(0).Cursor);
        await worker.step(TestContext.Current.CancellationToken);
        Assert.True((await completion).Ok);
        Assert.Equal(new[] { "once" }, runtime.Commands);
        Assert.Equal(2, runtime.Cleanups);
    }

    [Fact]
    public async Task repeatedPreparationFailureKeepsTheOriginalActionDeadline()
    {
        var queue = new ActionQueue();
        long now = 0;
        var runtime = new Runtime { Prepare = (_, _) => Task.FromResult(OperationResult.Failure("WINDOW_NOT_READY", "Window state changed.")) };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => now);
        var completion = queue.enqueue(request("focus"), 0, 10000, 999, TestContext.Current.CancellationToken);

        await worker.step(TestContext.Current.CancellationToken);
        now = 9999;
        await worker.step(TestContext.Current.CancellationToken);
        Assert.False(completion.IsCompleted);
        now = 10000;
        await worker.step(TestContext.Current.CancellationToken);

        Assert.Equal("ACTION_EXPIRED", (await completion).ErrorCode);
        Assert.Empty(runtime.Commands);
        Assert.Equal(2, runtime.Cleanups);
    }

    [Fact]
    public async Task inputReleaseFailureDuringPreparationRemainsTerminal()
    {
        var queue = new ActionQueue();
        var runtime = new Runtime { Prepare = (_, _) => Task.FromResult(OperationResult.Failure("INPUT_RELEASE_FAILED", "A generated key remains held.")) };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var completion = queue.enqueue(request("release"), 0, 10000, 999, TestContext.Current.CancellationToken);

        await worker.step(TestContext.Current.CancellationToken);

        Assert.Equal("INPUT_RELEASE_FAILED", (await completion).ErrorCode);
        Assert.Empty(runtime.Commands);
        Assert.Equal(1, runtime.Cleanups);
        Assert.Equal("idle", queue.snapshot(0).State);
    }

    [Fact]
    public async Task activityAfterQueueSelectionPausesBeforePreparingTheGameWindow()
    {
        var queue = new ActionQueue();
        var checks = 0;
        var preparations = 0;
        var runtime = new Runtime
        {
            Eligibility = _ => ++checks == 1 ? new(true) : new(false, "KEYBOARD_ACTIVE"),
            Prepare = (_, _) => { preparations++; return Task.FromResult(OperationResult.Success()); }
        };
        using var worker = new ActionWorker(queue, runtime, new Monitor(), () => 0);
        var completion = queue.enqueue(request("active-input"), 0, 10000, 999, TestContext.Current.CancellationToken);

        await worker.step(TestContext.Current.CancellationToken);

        Assert.Equal(0, preparations);
        Assert.False(completion.IsCompleted);
        Assert.Empty(runtime.Commands);
        Assert.Equal("KEYBOARD_ACTIVE", queue.snapshot(0).Reason);
        Assert.Equal(0, queue.snapshot(0).Cursor);
    }

    private static CoreActionRequest request(string id) => new(id, id, "user", "normal", new(1, "0x1"),
        [new("console", "first", "NumpadSubtract"), new("console", "second", "NumpadSubtract")]);

    private static JsonElement data(ConsoleExecutionResult result) =>
        JsonSerializer.SerializeToElement(result.Data, new JsonSerializerOptions(JsonSerializerDefaults.Web));

    private sealed class Runtime : IActionRuntime
    {
        public bool Allowed = true;
        public int Cleanups;
        public List<string> Commands = [];
        public Func<QueuedAction, CoreCommand, Action, CancellationToken, Task<CommandOutcome>>? Execute;
        public Func<QueuedAction, CancellationToken, Task<OperationResult>>? Prepare;
        public Func<CoreActionRequest, ExecutionEligibility>? Eligibility;
        public Func<CancellationToken, Task<IReadOnlyList<string>>>? Cleanup;
        public void refresh() { }
        public ExecutionEligibility eligibility(CoreActionRequest action) => Eligibility?.Invoke(action) ?? new(Allowed, Allowed ? null : "KEYBOARD_ACTIVE");
        public Task<OperationResult> prepare(QueuedAction action, CancellationToken token) => Prepare?.Invoke(action, token) ?? Task.FromResult(OperationResult.Success());
        public Task<CommandOutcome> execute(QueuedAction action, CoreCommand command, Action submitted, CancellationToken token)
        {
            if (Execute is not null) return Execute(action, command, submitted, token);
            Commands.Add(command.Command!);
            submitted();
            Allowed = false;
            return Task.FromResult(new CommandOutcome(true));
        }
        public Task<IReadOnlyList<string>> cleanup(CancellationToken token)
        {
            Cleanups++;
            if (Cleanup is not null) return Cleanup(token);
            return Task.FromResult<IReadOnlyList<string>>([]);
        }
    }
    private sealed class Monitor : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue { get; } = new();
        public CoreHostOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
