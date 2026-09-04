using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests;

public sealed class KeyPressServiceTests
{
    private static readonly ValidatedRestoreTarget QueueTarget = new(42, new IntPtr(0x1234));

    [Theory]
    [InlineData(null)]
    [InlineData(0)]
    [InlineData(255)]
    public async Task InvalidVirtualKeyIsRejectedBeforeCoreInput(int? virtualKey)
    {
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            new KeyPressRequest("request-1", virtualKey, 0, null),
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Empty(runtime.Calls);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(60001)]
    public async Task InvalidPressDurationIsRejectedBeforeCoreInput(int durationMs)
    {
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            new KeyPressRequest("request-1", 0x20, durationMs, null),
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Empty(runtime.Calls);
    }

    [Fact]
    public async Task BackgroundKeyPressWaitsForExistingCoreQueueOwner()
    {
        var gate = new ConsoleCommandGate();
        var existingLease = await gate.WaitAsync(QueueTarget, CancellationToken.None);
        var allowPress = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runtime = new FakeKeyPressRuntime
        {
            BeforePressAsync = (_, _) => allowPress.Task
        };
        var service = CreateService(runtime, gate);

        var execution = service.ExecuteAsync(
            new KeyPressRequest("request-1", 0x20, 0, null),
            CancellationToken.None);

        await Task.Yield();
        Assert.DoesNotContain("press:32:0", runtime.Calls);

        var existingCompletion = gate.CompleteAsync(
            existingLease,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));
        await runtime.PressStarted.Task.WaitAsync(
            TimeSpan.FromSeconds(1),
            TestContext.Current.CancellationToken);
        Assert.False(existingCompletion.IsCompleted);

        allowPress.SetResult();
        var result = await execution;
        await existingCompletion;

        Assert.True(result.Ok);
        Assert.Equal(
        [
            "resolve",
            "validate:false",
            "focus",
            "press:32:0",
            "complete:false"
        ],
            runtime.Calls);
    }

    [Fact]
    public async Task KeyPressReturnsTheSubmittedVirtualKeyAndDuration()
    {
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime);

        var result = await service.ExecuteAsync(
            new KeyPressRequest("request-1", 0x20, 125, null),
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal("keyPress", result.Command);
        var data = JsonSerializer.SerializeToElement(result.Data);
        Assert.Equal(32, data.GetProperty("virtualKey").GetInt32());
        Assert.Equal(125, data.GetProperty("durationMs").GetInt32());
    }

    [Fact]
    public async Task InvalidSequenceEntryIsRejectedBeforeCoreInput()
    {
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime);

        var result = await service.ExecuteSequenceAsync(
            new KeySequenceRequest(
                "request-1",
                [
                    new KeySequenceEntry(0x57, 20),
                    new KeySequenceEntry(255, 20)
                ],
                null),
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Empty(runtime.Calls);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(0)]
    public async Task InvalidMinimumMovementIdleIsRejectedBeforeCoreInput(
        int minimumMovementIdleMs)
    {
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime);

        var result = await service.ExecuteSequenceAsync(
            new KeySequenceRequest(
                "request-1",
                [new KeySequenceEntry(0x57, 20)],
                null,
                minimumMovementIdleMs),
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Empty(runtime.Calls);
    }

    [Fact]
    public async Task RecentMovementPreconditionSkipsSequenceBeforeFocus()
    {
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime);

        var result = await service.ExecuteSequenceAsync(
            new KeySequenceRequest(
                "request-1",
                [new KeySequenceEntry(0x57, 20)],
                null,
                int.MaxValue),
            CancellationToken.None);

        Assert.True(result.Ok);
        var data = JsonSerializer.SerializeToElement(result.Data);
        Assert.False(data.GetProperty("executed").GetBoolean());
        Assert.Equal("RECENT_MOVEMENT", data.GetProperty("reason").GetString());
        Assert.Equal(
        [
            "resolve",
            "validate:false",
            "complete:false"
        ],
            runtime.Calls);
    }

    [Fact]
    public async Task MovementWhileWaitingForLeaseSkipsSequenceAtActionStartup()
    {
        var time = new ManualTimeProvider();
        var movementActivity = new MovementActivityTracker(time);
        movementActivity.MarkAvailable();
        time.Advance(TimeSpan.FromMinutes(3));
        var gate = new ConsoleCommandGate();
        var existingLease = await gate.WaitAsync(QueueTarget, CancellationToken.None);
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime, gate, movementActivity);

        var execution = service.ExecuteSequenceAsync(
            new KeySequenceRequest(
                "request-1",
                [new KeySequenceEntry(0x57, 20)],
                null,
                120_000),
            CancellationToken.None);
        await Task.Yield();
        Assert.DoesNotContain("validate:false", runtime.Calls);

        movementActivity.RecordKeyDown(0x57, isInjected: false, gameIsForeground: true);
        var existingCompletion = gate.CompleteAsync(
            existingLease,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));

        var result = await execution;
        await existingCompletion;

        Assert.True(result.Ok);
        var data = JsonSerializer.SerializeToElement(result.Data);
        Assert.False(data.GetProperty("executed").GetBoolean());
        Assert.Equal(
        [
            "resolve",
            "validate:false",
            "complete:false"
        ],
            runtime.Calls);
    }

    [Fact]
    public async Task SequenceExecutesWhenMovementIdleTimeMeetsMinimum()
    {
        var time = new ManualTimeProvider();
        var movementActivity = new MovementActivityTracker(time);
        movementActivity.MarkAvailable();
        time.Advance(TimeSpan.FromMinutes(2));
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime, movementActivity: movementActivity);

        var result = await service.ExecuteSequenceAsync(
            new KeySequenceRequest(
                "request-1",
                [new KeySequenceEntry(0x57, 20)],
                null,
                120_000),
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Contains("focus", runtime.Calls);
        Assert.Contains("press:87:20", runtime.Calls);
    }

    [Fact]
    public async Task UnavailableMovementMonitorSkipsGatedSequenceWithoutFocus()
    {
        var time = new ManualTimeProvider();
        var movementActivity = new MovementActivityTracker(time);
        time.Advance(TimeSpan.FromMinutes(3));
        var runtime = new FakeKeyPressRuntime();
        var service = CreateService(runtime, movementActivity: movementActivity);

        var result = await service.ExecuteSequenceAsync(
            new KeySequenceRequest(
                "request-1",
                [new KeySequenceEntry(0x57, 20)],
                null,
                120_000),
            CancellationToken.None);

        Assert.True(result.Ok);
        var data = JsonSerializer.SerializeToElement(result.Data);
        Assert.False(data.GetProperty("executed").GetBoolean());
        Assert.Equal("MOVEMENT_MONITOR_UNAVAILABLE", data.GetProperty("reason").GetString());
        Assert.DoesNotContain("focus", runtime.Calls);
    }

    [Fact]
    public async Task KeySequenceKeepsOneQueueLeaseUntilEveryPressFinishes()
    {
        var gate = new ConsoleCommandGate();
        var allowSecondPress = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var secondPressStarted = new TaskCompletionSource(
            TaskCreationOptions.RunContinuationsAsynchronously);
        var pressCount = 0;
        var runtime = new FakeKeyPressRuntime
        {
            BeforePressAsync = (_, _) =>
            {
                pressCount += 1;
                if (pressCount != 2) return Task.CompletedTask;
                secondPressStarted.TrySetResult();
                return allowSecondPress.Task;
            }
        };
        var service = CreateService(runtime, gate);

        var execution = service.ExecuteSequenceAsync(
            new KeySequenceRequest(
                "request-1",
                [
                    new KeySequenceEntry(0x57, 20),
                    new KeySequenceEntry(0x53, 20),
                    new KeySequenceEntry(0x0D, 50)
                ],
                null),
            CancellationToken.None);

        await secondPressStarted.Task.WaitAsync(
            TimeSpan.FromSeconds(1),
            TestContext.Current.CancellationToken);
        var queuedOwner = gate.WaitAsync(QueueTarget, CancellationToken.None);
        Assert.False(queuedOwner.IsCompleted);

        allowSecondPress.SetResult();
        var queuedLease = await queuedOwner.WaitAsync(
            TimeSpan.FromSeconds(1),
            TestContext.Current.CancellationToken);
        var queuedCompletion = gate.CompleteAsync(
            queuedLease,
            canContinue: false,
            () => Task.FromResult<IReadOnlyList<string>>([]));
        var result = await execution;
        await queuedCompletion;

        Assert.True(result.Ok);
        Assert.Equal("keySequence", result.Command);
        Assert.Equal(
        [
            "resolve",
            "validate:false",
            "focus",
            "press:87:20",
            "press:83:20",
            "press:13:50"
        ],
            runtime.Calls);
    }

    private static KeyPressService CreateService(
        IKeyPressRuntime runtime,
        ConsoleCommandGate? gate = null,
        MovementActivityTracker? movementActivity = null)
    {
        if (movementActivity is null)
        {
            movementActivity = new MovementActivityTracker();
            movementActivity.MarkAvailable();
        }
        return new KeyPressService(
            gate ?? new ConsoleCommandGate(),
            runtime,
            movementActivity,
            new StaticOptionsMonitor(new CoreHostOptions()));
    }

    private sealed class FakeKeyPressRuntime : IKeyPressRuntime
    {
        public List<string> Calls { get; } = [];

        public TaskCompletionSource PressStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Func<ushort, int, Task>? BeforePressAsync { get; init; }

        public RestoreTargetValidationResult ResolveQueueTarget(JsonElement? restoreTarget)
        {
            Calls.Add("resolve");
            return new RestoreTargetValidationResult(true, QueueTarget, null, null);
        }

        public RestoreTargetValidationResult ValidateQueueTarget(
            ValidatedRestoreTarget restoreTarget,
            bool requireForeground)
        {
            Calls.Add($"validate:{requireForeground.ToString().ToLowerInvariant()}");
            return new RestoreTargetValidationResult(true, restoreTarget, null, null);
        }

        public Task<OperationResult> FocusGameAsync(CancellationToken cancellationToken)
        {
            Calls.Add("focus");
            return Task.FromResult(OperationResult.Success());
        }

        public async Task<OperationResult> PressVirtualKeyAsync(
            ushort virtualKey,
            int durationMs,
            CancellationToken cancellationToken)
        {
            Calls.Add($"press:{virtualKey}:{durationMs}");
            PressStarted.TrySetResult();
            if (BeforePressAsync is not null) await BeforePressAsync(virtualKey, durationMs);
            return OperationResult.Success();
        }

        public Task<ConsoleExecutionResult> CompleteAsync(
            ConsoleExecutionResult result,
            ValidatedRestoreTarget restoreTarget,
            bool restoreRequested)
        {
            Calls.Add($"complete:{restoreRequested.ToString().ToLowerInvariant()}");
            return Task.FromResult(result);
        }
    }

    private sealed class StaticOptionsMonitor(CoreHostOptions options) : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue => options;

        public CoreHostOptions Get(string? name) => options;

        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private long _timestamp;

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public override long GetTimestamp() => _timestamp;

        public void Advance(TimeSpan duration) => _timestamp += duration.Ticks;
    }
}
