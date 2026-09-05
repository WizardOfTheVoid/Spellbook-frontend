using System.Diagnostics;
using System.Reflection;
using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests;

public sealed class ConsoleCommandBatchServiceTests
{
    private static readonly ValidatedRestoreTarget RestoreTarget = new(42, new IntPtr(0x1234));

    [Fact]
    public async Task ExecuteAsyncFocusesOnceSubmitsInOrderAndCompletesOnce()
    {
        var runtime = new FakeConsoleBatchRuntime();
        var service = CreateService(runtime);
        var commands = Commands("first", "second");

        var result = await service.ExecuteAsync("request-1", commands, null, CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal(["resolve", "validate", "focus", "submit:first", "submit:second", "complete"], runtime.Calls);
        Assert.Equal(1, runtime.FocusCalls);
        Assert.Equal(1, runtime.CompleteCalls);
        AssertProgress(result, sentCommands: 2, failedCommandIndex: null);
    }

    [Fact]
    public async Task BackgroundBatchUsesOwnedValidationAndTheExactLeaseTargetWithoutRestoration()
    {
        var runtime = new FakeConsoleBatchRuntime();
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "wanted-ban",
            Commands("ban", "server-message"),
            null,
            background: true,
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal([true], runtime.ResolveBackgroundValues);
        Assert.Equal([false], runtime.RequireForegroundValues);
        Assert.Equal([RestoreTarget], runtime.FocusTargets);
        Assert.Equal([true], runtime.FocusBackgroundValues);
        Assert.Equal([false], runtime.RestoreForegroundValues);
    }

    [Fact]
    public async Task QueuedBatchChecksFocusKeepsEarlierResponseOpenAndRestoresOnce()
    {
        var firstStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var allowFirst = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var secondStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var allowSecond = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runtime = new FakeConsoleBatchRuntime
        {
            BeforeSubmitAsync = async command =>
            {
                var (started, allowed) = command.Command == "first"
                    ? (firstStarted, allowFirst)
                    : (secondStarted, allowSecond);
                started.SetResult();
                await allowed.Task;
            }
        };
        var service = CreateService(runtime);

        var firstExecution = service.ExecuteAsync(
            "request-1",
            Commands("first"),
            null,
            CancellationToken.None);
        await firstStarted.Task;

        var secondExecution = service.ExecuteAsync(
            "request-2",
            Commands("second"),
            null,
            CancellationToken.None);
        allowFirst.SetResult();
        await secondStarted.Task;

        Assert.False(firstExecution.IsCompleted);
        Assert.Equal(0, runtime.CompleteCalls);

        allowSecond.SetResult();
        Assert.True((await firstExecution).Ok);
        Assert.True((await secondExecution).Ok);
        Assert.Equal(2, runtime.FocusCalls);
        Assert.Equal(1, runtime.CompleteCalls);
    }

    [Fact]
    public async Task ExecuteAsyncWaitsAfterCommandBeforeCompleting()
    {
        var runtime = new FakeConsoleBatchRuntime();
        var service = CreateService(runtime, afterCommandDelayMs: 60);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first"),
            null,
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.True(
            runtime.FinalEnterToCompleteElapsed >= TimeSpan.FromMilliseconds(45),
            $"Expected a command settle, but cleanup started after {runtime.FinalEnterToCompleteElapsed.TotalMilliseconds:F3} ms.");
    }

    [Fact]
    public async Task ExecuteAsyncStopsAtFirstSubmitFailureAndCompletesOnce()
    {
        var runtime = new FakeConsoleBatchRuntime
        {
            SubmitResults =
            [
                Submitted(),
                Failed("INPUT_FAILED", "Second command failed."),
                Submitted()
            ]
        };
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first", "second", "third"),
            null,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INPUT_FAILED", result.ErrorCode);
        Assert.Equal("Second command failed.", result.ErrorMessage);
        Assert.Equal(["resolve", "validate", "focus", "submit:first", "submit:second", "complete"], runtime.Calls);
        Assert.Equal(1, runtime.CompleteCalls);
        AssertProgress(result, sentCommands: 1, failedCommandIndex: 1);
    }

    [Fact]
    public async Task ExecuteAsyncCountsCommandWhenCancellationHappensAfterEnter()
    {
        var runtime = new FakeConsoleBatchRuntime
        {
            SubmitResults = [CancelledAfterEnter()]
        };
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first"),
            null,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("COMMAND_TIMEOUT", result.ErrorCode);
        AssertProgress(result, sentCommands: 1, failedCommandIndex: null);
        Assert.Same(runtime.SubmitAttempts.Single(), runtime.CompletedAttempt);
        Assert.True(runtime.CompletedAttempt?.CommandSubmitted);
    }

    [Fact]
    public async Task ExecuteAsyncCountsPartialEnterFailureAndStopsLaterCommands()
    {
        var runtime = new FakeConsoleBatchRuntime
        {
            SubmitResults =
            [
                FailedAfterEnter("INPUT_FAILED", "Only Enter key-down was inserted."),
                Submitted()
            ]
        };
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first", "second"),
            null,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INPUT_FAILED", result.ErrorCode);
        Assert.Equal(["resolve", "validate", "focus", "submit:first", "complete"], runtime.Calls);
        AssertProgress(result, sentCommands: 1, failedCommandIndex: null);
        Assert.True(runtime.CompletedAttempt?.CommandSubmitted);
    }

    [Fact]
    public async Task ExecuteAsyncUsesCleanSecondAttemptWhenFailureHappensBeforeOpen()
    {
        var runtime = new FakeConsoleBatchRuntime
        {
            SubmitResults =
            [
                Submitted(),
                Failed("INPUT_FAILED", "Second command failed before open.")
            ]
        };
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first", "second"),
            null,
            CancellationToken.None);

        Assert.False(result.Ok);
        AssertProgress(result, sentCommands: 1, failedCommandIndex: 1);
        Assert.NotSame(runtime.SubmitAttempts[0], runtime.SubmitAttempts[1]);
        Assert.Same(runtime.SubmitAttempts[1], runtime.CompletedAttempt);
        Assert.False(runtime.CompletedAttempt?.MayBeOpen);
        Assert.False(runtime.CompletedAttempt?.CommandSubmitted);
    }

    [Fact]
    public async Task ExecuteAsyncUsesOpenSecondAttemptWhenFailureHappensBeforeEnter()
    {
        var runtime = new FakeConsoleBatchRuntime
        {
            SubmitResults =
            [
                Submitted(),
                Failed("INPUT_FAILED", "Second command failed before Enter.", consoleMayBeOpen: true)
            ]
        };
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first", "second"),
            null,
            CancellationToken.None);

        Assert.False(result.Ok);
        AssertProgress(result, sentCommands: 1, failedCommandIndex: 1);
        Assert.Same(runtime.SubmitAttempts[1], runtime.CompletedAttempt);
        Assert.True(runtime.CompletedAttempt?.MayBeOpen);
        Assert.False(runtime.CompletedAttempt?.CommandSubmitted);
    }

    [Fact]
    public async Task ExecuteAsyncValidatesOnlyAfterAcquiringTheSharedGate()
    {
        var gate = new ConsoleCommandGate();
        var runtime = new FakeConsoleBatchRuntime();
        var service = CreateService(runtime, gate);
        var heldLease = await gate.WaitAsync(RestoreTarget, CancellationToken.None);
        var gateHeldByTest = true;

        try
        {
            var execution = service.ExecuteAsync(
                "request-1",
                Commands("first"),
                null,
                CancellationToken.None);

            await Assert.ThrowsAsync<TimeoutException>(async () =>
                await runtime.ValidationStarted.Task.WaitAsync(
                    TimeSpan.FromMilliseconds(50),
                    TestContext.Current.CancellationToken));

            var heldCompletion = gate.CompleteAsync(
                heldLease,
                canContinue: true,
                () => Task.FromResult<IReadOnlyList<string>>([]));
            gateHeldByTest = false;

            var result = await execution.WaitAsync(
                TimeSpan.FromSeconds(1),
                TestContext.Current.CancellationToken);
            Assert.True(result.Ok);
            Assert.Equal(1, runtime.ValidateCalls);
            await heldCompletion;
        }
        finally
        {
            if (gateHeldByTest)
            {
                await gate.CompleteAsync(
                    heldLease,
                    canContinue: false,
                    () => Task.FromResult<IReadOnlyList<string>>([]));
            }
        }
    }

    [Fact]
    public async Task BackgroundBatchRejectsAStaleOwnedTargetAfterWaitingForTheGate()
    {
        var gate = new ConsoleCommandGate();
        var runtime = new FakeConsoleBatchRuntime();
        var service = CreateService(runtime, gate);
        var heldLease = await gate.WaitAsync(RestoreTarget, CancellationToken.None);
        var execution = service.ExecuteAsync(
            "request-1",
            Commands("first"),
            null,
            background: true,
            CancellationToken.None);

        await Assert.ThrowsAsync<TimeoutException>(async () =>
            await runtime.ValidationStarted.Task.WaitAsync(
                TimeSpan.FromMilliseconds(50),
                TestContext.Current.CancellationToken));
        runtime.ValidationResult = new RestoreTargetValidationResult(
            false,
            null,
            "RESTORE_TARGET_INACTIVE",
            "The game target is no longer visible.");
        var heldCompletion = gate.CompleteAsync(
            heldLease,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));

        var result = await execution.WaitAsync(
            TimeSpan.FromSeconds(1),
            TestContext.Current.CancellationToken);
        await heldCompletion;

        Assert.False(result.Ok);
        Assert.Equal("RESTORE_TARGET_INACTIVE", result.ErrorCode);
        Assert.Equal([false], runtime.RequireForegroundValues);
        Assert.Equal(0, runtime.FocusCalls);
        Assert.Empty(runtime.SubmitAttempts);
    }

    [Fact]
    public async Task HiddenBatchRechecksActivityAfterWaitingForTheGate()
    {
        var commandGate = new ConsoleCommandGate();
        var runtime = new FakeConsoleBatchRuntime();
        var activity = new FakeGameInputActivityGate();
        var service = CreateService(runtime, commandGate, activityGate: activity);
        var heldLease = await commandGate.WaitAsync(RestoreTarget, CancellationToken.None);
        var execution = service.ExecuteAsync(
            "request-1",
            Commands("first"),
            null,
            background: true,
            requireIdle: true,
            CancellationToken.None);

        await Task.Delay(25, TestContext.Current.CancellationToken);
        Assert.Equal(0, activity.Calls);
        activity.Result = ConsoleExecutionResult.Success(
            "request-1",
            "game-input",
            new { executed = false, reason = "RECENT_MOVEMENT" });
        var heldCompletion = commandGate.CompleteAsync(
            heldLease,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));

        var result = await execution;
        await heldCompletion;

        Assert.True(result.Ok);
        Assert.Equal(1, activity.Calls);
        Assert.Equal(0, runtime.ValidateCalls);
        Assert.Empty(runtime.SubmitAttempts);
    }

    [Fact]
    public async Task ExecuteAsyncCompletesOnceWhenFocusFails()
    {
        var runtime = new FakeConsoleBatchRuntime
        {
            FocusResult = OperationResult.Failure("FOCUS_FAILED", "Could not focus the game.")
        };
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first"),
            null,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("FOCUS_FAILED", result.ErrorCode);
        Assert.Equal(["resolve", "validate", "focus", "complete"], runtime.Calls);
        Assert.Equal(1, runtime.CompleteCalls);
        AssertProgress(result, sentCommands: 0, failedCommandIndex: null);
    }

    [Fact]
    public async Task NewSessionValidationFailureDoesNotRestoreAnUnacceptedTarget()
    {
        var runtime = new FakeConsoleBatchRuntime
        {
            ValidationResult = new RestoreTargetValidationResult(
                false,
                null,
                "RESTORE_TARGET_INACTIVE",
                "The restore target is not foreground.")
        };
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            "request-1",
            Commands("first"),
            null,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("RESTORE_TARGET_INACTIVE", result.ErrorCode);
        Assert.Equal(0, runtime.FocusCalls);
        Assert.Equal(0, runtime.CompleteCalls);
    }

    [Fact]
    public async Task ExecuteAsyncDoesNothingWhenCancelledBeforeGateAcquisition()
    {
        var gate = new ConsoleCommandGate();
        var runtime = new FakeConsoleBatchRuntime();
        var service = CreateService(runtime, gate);
        var heldLease = await gate.WaitAsync(RestoreTarget, CancellationToken.None);
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        try
        {
            var result = await service.ExecuteAsync(
                "request-1",
                Commands("first"),
                null,
                cancellation.Token);

            Assert.False(result.Ok);
            Assert.Equal("COMMAND_TIMEOUT", result.ErrorCode);
            Assert.Equal(["resolve"], runtime.Calls);
        }
        finally
        {
            await gate.CompleteAsync(
                heldLease,
                canContinue: false,
                () => Task.FromResult<IReadOnlyList<string>>([]));
        }
    }

    private static IReadOnlyList<PreparedConsoleCommand> Commands(params string[] commands)
    {
        return commands.Select(command => new PreparedConsoleCommand("warn", command, 0)).ToArray();
    }

    private static ConsoleCommandBatchService CreateService(
        FakeConsoleBatchRuntime runtime,
        ConsoleCommandGate? gate = null,
        int afterCommandDelayMs = 0,
        IGameInputActivityGate? activityGate = null)
    {
        var options = new CoreHostOptions();
        options.Timing.AfterCommandDelayMs = afterCommandDelayMs;
        return new ConsoleCommandBatchService(
            gate ?? new ConsoleCommandGate(),
            runtime,
            new StaticOptionsMonitor(options),
            activityGate ?? new FakeGameInputActivityGate());
    }

    private static FakeSubmitStep Submitted()
    {
        return new FakeSubmitStep(
            new ConsoleCommandSubmitResult(OperationResult.Success(), EnterSent: true, Cancelled: false),
            ConsoleMayBeOpen: true);
    }

    private static FakeSubmitStep CancelledAfterEnter()
    {
        return new FakeSubmitStep(
            new ConsoleCommandSubmitResult(
                OperationResult.Failure("COMMAND_TIMEOUT", "Console command execution timed out."),
                EnterSent: true,
                Cancelled: true),
            ConsoleMayBeOpen: true);
    }

    private static FakeSubmitStep Failed(
        string code,
        string message,
        bool consoleMayBeOpen = false)
    {
        return new FakeSubmitStep(
            new ConsoleCommandSubmitResult(
                OperationResult.Failure(code, message),
                EnterSent: false,
                Cancelled: false),
            consoleMayBeOpen);
    }

    private static FakeSubmitStep FailedAfterEnter(string code, string message)
    {
        return new FakeSubmitStep(
            new ConsoleCommandSubmitResult(
                OperationResult.Failure(code, message),
                EnterSent: true,
                Cancelled: false),
            ConsoleMayBeOpen: true);
    }

    private static void AssertProgress(
        ConsoleExecutionResult result,
        int sentCommands,
        int? failedCommandIndex)
    {
        var data = JsonSerializer.SerializeToElement(result.Data);
        Assert.Equal(sentCommands, data.GetProperty("sentCommands").GetInt32());

        var failedIndex = data.GetProperty("failedCommandIndex");
        if (failedCommandIndex is null)
        {
            Assert.Equal(JsonValueKind.Null, failedIndex.ValueKind);
        }
        else
        {
            Assert.Equal(failedCommandIndex.Value, failedIndex.GetInt32());
        }
    }

    private sealed class FakeConsoleBatchRuntime : IConsoleBatchRuntime
    {
        private int _submitIndex;

        public List<string> Calls { get; } = [];

        public TaskCompletionSource<bool> ValidationStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public RestoreTargetValidationResult ValidationResult { get; set; } =
            new(true, RestoreTarget, null, null);

        public RestoreTargetValidationResult ResolutionResult { get; set; } =
            new(true, RestoreTarget, null, null);

        public OperationResult FocusResult { get; set; } = OperationResult.Success();

        public IReadOnlyList<FakeSubmitStep> SubmitResults { get; set; } = [];

        public Func<PreparedConsoleCommand, Task>? BeforeSubmitAsync { get; set; }

        public List<ConsoleOpenAttemptState> SubmitAttempts { get; } = [];

        public ConsoleOpenAttemptState? CompletedAttempt { get; private set; }

        public int ValidateCalls { get; private set; }

        public int FocusCalls { get; private set; }

        public int CompleteCalls { get; private set; }

        public TimeSpan FinalEnterToCompleteElapsed { get; private set; }

        private long FinalEnterSubmittedAt { get; set; }

        public List<bool> ResolveBackgroundValues { get; } = [];

        public List<bool> RequireForegroundValues { get; } = [];

        public List<ValidatedRestoreTarget> FocusTargets { get; } = [];

        public List<bool> FocusBackgroundValues { get; } = [];

        public List<bool> RestoreForegroundValues { get; } = [];

        public RestoreTargetValidationResult ResolveExecutionTarget(
            JsonElement? restoreTarget,
            bool background)
        {
            Calls.Add("resolve");
            ResolveBackgroundValues.Add(background);
            return ResolutionResult;
        }

        public RestoreTargetValidationResult ValidateExecutionTarget(
            ValidatedRestoreTarget restoreTarget,
            bool requireForeground)
        {
            ValidateCalls++;
            Calls.Add("validate");
            RequireForegroundValues.Add(requireForeground);
            ValidationStarted.TrySetResult(true);
            return ValidationResult;
        }

        public Task<OperationResult> FocusGameAsync(
            ValidatedRestoreTarget leaseTarget,
            bool background,
            CancellationToken cancellationToken)
        {
            FocusCalls++;
            Calls.Add("focus");
            FocusTargets.Add(leaseTarget);
            FocusBackgroundValues.Add(background);
            return Task.FromResult(FocusResult);
        }

        public async Task<ConsoleCommandSubmitResult> SubmitAsync(
            PreparedConsoleCommand command,
            ConsoleOpenAttemptState attempt,
            CancellationToken cancellationToken)
        {
            Calls.Add($"submit:{command.Command}");
            SubmitAttempts.Add(attempt);
            if (BeforeSubmitAsync is not null)
            {
                await BeforeSubmitAsync(command);
            }

            var step = _submitIndex < SubmitResults.Count
                ? SubmitResults[_submitIndex]
                : Submitted();
            _submitIndex++;

            if (step.ConsoleMayBeOpen)
            {
                InvokeAttemptTransition(attempt, "MarkInputSent");
            }

            if (step.Result.EnterSent)
            {
                InvokeAttemptTransition(attempt, "MarkCommandSubmitted");
                FinalEnterSubmittedAt = Stopwatch.GetTimestamp();
            }

            return step.Result;
        }

        public Task<ConsoleExecutionResult> CompleteAsync(
            ConsoleExecutionResult result,
            ConsoleOpenAttemptState attempt,
            ValidatedRestoreTarget restoreTarget,
            bool restoreForeground)
        {
            CompleteCalls++;
            Calls.Add("complete");
            CompletedAttempt = attempt;
            RestoreForegroundValues.Add(restoreForeground);
            FinalEnterToCompleteElapsed = Stopwatch.GetElapsedTime(FinalEnterSubmittedAt);
            return Task.FromResult(result);
        }

        private static void InvokeAttemptTransition(ConsoleOpenAttemptState attempt, string methodName)
        {
            var method = typeof(ConsoleOpenAttemptState).GetMethod(
                methodName,
                BindingFlags.Instance | BindingFlags.NonPublic);
            Assert.NotNull(method);
            method.Invoke(attempt, null);
        }
    }

    private sealed record FakeSubmitStep(
        ConsoleCommandSubmitResult Result,
        bool ConsoleMayBeOpen);

    private sealed class StaticOptionsMonitor(CoreHostOptions options) : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue => options;

        public CoreHostOptions Get(string? name) => options;

        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }

    private sealed class FakeGameInputActivityGate : IGameInputActivityGate
    {
        public int Calls { get; private set; }

        public ConsoleExecutionResult? Result { get; set; }

        public ConsoleExecutionResult? Check(string requestId, bool requireIdle)
        {
            Calls++;
            return Result;
        }
    }
}
