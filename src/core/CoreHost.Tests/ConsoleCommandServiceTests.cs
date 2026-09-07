using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests;

public sealed class ConsoleCommandServiceTests
{
    private static readonly ValidatedRestoreTarget OverlayTarget = new(42, new IntPtr(0x1234));
    private static readonly ValidatedRestoreTarget GameTarget = new(55, new IntPtr(0x5678));
    private static readonly ValidatedRestoreTarget OtherGameTarget = new(56, new IntPtr(0x6789));

    [Fact]
    public async Task TypedListPlayersRejectsMissingInteractiveTargetBeforeInput()
    {
        var fixture = CreateFixture();
        fixture.Targets.ResolutionResult = new RestoreTargetValidationResult(
            false,
            null,
            "INVALID_RESTORE_TARGET",
            "A restore target is required.");

        var result = await fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: false),
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INVALID_RESTORE_TARGET", result.ErrorCode);
        Assert.Equal([false], fixture.Targets.ResolveBackgroundValues);
        Assert.Equal(0, fixture.Keyboard.SendCalls);
        Assert.Empty(fixture.Clipboard.Writes);
    }

    [Fact]
    public async Task TypedBackgroundListPlayersPreservesClipboardParsingWarningsAndLastSummary()
    {
        var fixture = CreateFixture();
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue("ORIGINAL"));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue(ListPlayersOutput("Player One", includeWarning: true)));

        var result = await fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: true),
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal("ListPlayers", result.Command);
        var parsed = Assert.IsType<ListPlayersParseResult>(result.Data);
        Assert.Equal("Player One", Assert.Single(parsed.Players).Name);
        Assert.Contains("LISTPLAYERS_PARSE_PARTIAL", result.Warnings);
        Assert.Equal(["ListPlayers", "ORIGINAL"], fixture.Clipboard.Writes);
        Assert.Equal([true], fixture.Targets.ResolveBackgroundValues);
        Assert.Equal([false], fixture.Targets.RequireForegroundValues);
        Assert.Equal(GameTarget.WindowHandle, fixture.WindowApi.ForegroundWindowHandle);

        var last = Assert.IsType<LastListPlayersSummary>(fixture.Service.GetLastListPlayersSummary());
        Assert.Equal("Test Server", last.ServerName);
        Assert.Equal(1, last.PlayerCount);
    }

    [Fact]
    public async Task ListPlayersCacheIsScopedToTheResolvedLeaseTarget()
    {
        var fixture = CreateFixture(cacheTtlMs: 5000);
        fixture.Targets.ResolutionTargets.Enqueue(GameTarget);
        fixture.Targets.ResolutionTargets.Enqueue(GameTarget);
        fixture.Targets.ResolutionTargets.Enqueue(OtherGameTarget);
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue("ORIGINAL-1"));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue(ListPlayersOutput("Player One")));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue("ORIGINAL-2"));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue(ListPlayersOutput("Player Two")));

        var first = await fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: true),
            CancellationToken.None);
        var cached = await fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-2", 500, null, Background: true),
            CancellationToken.None);
        var otherTarget = await fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-3", 500, null, Background: true),
            CancellationToken.None);

        Assert.Equal("Player One", Assert.Single(Assert.IsType<ListPlayersParseResult>(first.Data).Players).Name);
        Assert.Equal("Player One", Assert.Single(Assert.IsType<ListPlayersParseResult>(cached.Data).Players).Name);
        Assert.Equal("list-2", cached.RequestId);
        Assert.Equal("Player Two", Assert.Single(Assert.IsType<ListPlayersParseResult>(otherTarget.Data).Players).Name);
        Assert.Equal(2, fixture.Clipboard.Writes.Count(text => text == "ListPlayers"));
    }

    [Fact]
    public async Task ConcurrentListPlayersForTheSameTargetCoalesceIntoOneInput()
    {
        var fixture = CreateFixture();
        fixture.Targets.ResolutionTargets.Enqueue(GameTarget);
        fixture.Targets.ResolutionTargets.Enqueue(GameTarget);
        var outputRead = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseOutput = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Clipboard.OnReadAsync = async call =>
        {
            if (call == 1)
            {
                return ClipboardTextResult.TextValue("ORIGINAL");
            }

            outputRead.TrySetResult();
            await releaseOutput.Task;
            return ClipboardTextResult.TextValue(ListPlayersOutput("Player One"));
        };

        var first = fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: true),
            CancellationToken.None);
        await outputRead.Task.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken);
        var second = fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-2", 500, null, Background: true),
            CancellationToken.None);
        releaseOutput.TrySetResult();

        Assert.True((await first).Ok);
        Assert.Equal("list-2", (await second).RequestId);
        Assert.Equal(1, fixture.Clipboard.Writes.Count(text => text == "ListPlayers"));
    }

    [Fact]
    public async Task RejectedListPlayersOutputDoesNotReplaceTheLastAcceptedSummary()
    {
        var fixture = CreateFixture();
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue("ORIGINAL-1"));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue(ListPlayersOutput("Player One")));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue("ORIGINAL-2"));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue("not listplayers output"));
        var accepted = await fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: true),
            CancellationToken.None);

        var rejected = await fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-2", 500, null, Background: true),
            CancellationToken.None);

        Assert.True(accepted.Ok);
        Assert.False(rejected.Ok);
        Assert.Equal("CLIPBOARD_TIMEOUT", rejected.ErrorCode);
        var last = Assert.IsType<LastListPlayersSummary>(fixture.Service.GetLastListPlayersSummary());
        Assert.Equal("Test Server", last.ServerName);
        Assert.Equal(1, last.PlayerCount);
    }

    [Fact]
    public async Task RawRequestsAlwaysUseInteractiveTargeting()
    {
        var fixture = CreateFixture();
        var request = JsonSerializer.Deserialize<RawConsoleCommandRequest>(
            $$"""
            {
              "Id": "raw-1",
              "Command": "Adminsay \"Hello\"",
              "ExpectClipboard": false,
              "TimeoutMs": 500,
              "RestoreClipboard": true,
              "RestoreTarget": {
                "processId": {{OverlayTarget.ProcessId}},
                "windowHandle": "0x{{OverlayTarget.WindowHandle.ToInt64():X16}}"
              },
              "Background": true
            }
            """);

        var result = await fixture.Service.ExecuteRawAsync(
            Assert.IsType<RawConsoleCommandRequest>(request),
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal([false], fixture.Targets.ResolveBackgroundValues);
    }

    [Fact]
    public async Task RawUnbanAlwaysSubmitsFourCommands()
    {
        var fixture = CreateFixture();

        var result = await fixture.Service.ExecuteRawAsync(
            new RawConsoleCommandRequest(
                "raw-unban",
                "unbanbyid PLAYER_1",
                ExpectClipboard: false,
                TimeoutMs: 500,
                RestoreClipboard: true,
                RestoreTarget: null),
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal(4, fixture.Keyboard.InputBatches.Count(batch =>
            batch.Any(input => input.VirtualKey == 0x0D && input.Flags == 0)));
    }

    [Fact]
    public async Task BackgroundListPlayersRevalidatesOwnershipAfterWaitingForTheGate()
    {
        var fixture = CreateFixture();
        var heldLease = await fixture.Gate.WaitAsync(GameTarget, CancellationToken.None);
        var execution = fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: true),
            CancellationToken.None);

        await Assert.ThrowsAsync<TimeoutException>(async () =>
            await fixture.Targets.ValidationStarted.Task.WaitAsync(
                TimeSpan.FromMilliseconds(50),
                TestContext.Current.CancellationToken));
        fixture.Targets.ValidationResult = new RestoreTargetValidationResult(
            false,
            null,
            "RESTORE_TARGET_INACTIVE",
            "The game target is no longer visible.");
        var heldCompletion = fixture.Gate.CompleteAsync(
            heldLease,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));

        var result = await execution.WaitAsync(
            TimeSpan.FromSeconds(1),
            TestContext.Current.CancellationToken);
        await heldCompletion;

        Assert.False(result.Ok);
        Assert.Equal("RESTORE_TARGET_INACTIVE", result.ErrorCode);
        Assert.Equal([false], fixture.Targets.RequireForegroundValues);
        Assert.Equal(0, fixture.Keyboard.SendCalls);
        Assert.Empty(fixture.Clipboard.Writes);
    }

    [Fact]
    public async Task BackgroundListPlayersBlocksBatchOnTheSameGate()
    {
        var fixture = CreateFixture();
        var outputRead = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var releaseOutput = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        fixture.Clipboard.OnReadAsync = async call =>
        {
            if (call == 1)
            {
                return ClipboardTextResult.TextValue("ORIGINAL");
            }

            outputRead.TrySetResult();
            await releaseOutput.Task;
            return ClipboardTextResult.TextValue(ListPlayersOutput("Player One"));
        };
        var batchRuntime = new GateBatchRuntime();
        var batchService = CreateBatchService(fixture.Gate, batchRuntime);

        var listPlayers = fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: true),
            CancellationToken.None);
        await outputRead.Task.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken);
        var batch = batchService.ExecuteAsync(
            "batch-1",
            [new PreparedConsoleCommand("warn", "Serversay \"Hello\"", 0)],
            null,
            background: true,
            CancellationToken.None);

        await Assert.ThrowsAsync<TimeoutException>(async () =>
            await batchRuntime.ValidationStarted.Task.WaitAsync(
                TimeSpan.FromMilliseconds(50),
                TestContext.Current.CancellationToken));

        releaseOutput.TrySetResult();
        Assert.True((await listPlayers).Ok);
        Assert.True((await batch).Ok);
        Assert.True(batchRuntime.SubmitStarted.Task.IsCompletedSuccessfully);
    }

    [Fact]
    public async Task BackgroundBatchBlocksListPlayersOnTheSameGate()
    {
        var fixture = CreateFixture();
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue("ORIGINAL"));
        fixture.Clipboard.Reads.Enqueue(ClipboardTextResult.TextValue(ListPlayersOutput("Player One")));
        var releaseBatch = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var batchRuntime = new GateBatchRuntime { BlockSubmitUntil = releaseBatch.Task };
        var batchService = CreateBatchService(fixture.Gate, batchRuntime);

        var batch = batchService.ExecuteAsync(
            "batch-1",
            [new PreparedConsoleCommand("warn", "Serversay \"Hello\"", 0)],
            null,
            background: true,
            CancellationToken.None);
        await batchRuntime.SubmitStarted.Task.WaitAsync(
            TimeSpan.FromSeconds(1),
            TestContext.Current.CancellationToken);
        var listPlayers = fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-1", 500, null, Background: true),
            CancellationToken.None);

        await Assert.ThrowsAsync<TimeoutException>(async () =>
            await fixture.Clipboard.ReadStarted.Task.WaitAsync(
                TimeSpan.FromMilliseconds(50),
                TestContext.Current.CancellationToken));

        releaseBatch.TrySetResult();
        Assert.True((await batch).Ok);
        Assert.True((await listPlayers).Ok);
        Assert.Equal(1, fixture.Clipboard.Writes.Count(text => text == "ListPlayers"));
    }

    [Fact]
    public async Task HiddenListPlayersRechecksActivityAfterWaitingForTheGate()
    {
        var activity = new FakeGameInputActivityGate();
        var fixture = CreateFixture(activityGate: activity);
        var heldLease = await fixture.Gate.WaitAsync(OverlayTarget, CancellationToken.None);
        var execution = fixture.Service.ExecuteListPlayersAsync(
            new ListPlayersRequest("list-hidden", 1000, null, Background: true, RequireIdle: true),
            CancellationToken.None);

        await Task.Delay(25, TestContext.Current.CancellationToken);
        Assert.Equal(0, activity.Calls);
        activity.Result = ConsoleExecutionResult.Success(
            "list-hidden",
            "game-input",
            new { executed = false, reason = "RECENT_MOVEMENT" });
        var heldCompletion = fixture.Gate.CompleteAsync(
            heldLease,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));

        var result = await execution;
        await heldCompletion;

        Assert.True(result.Ok);
        Assert.Equal(1, activity.Calls);
        Assert.DoesNotContain("ListPlayers", fixture.Clipboard.Writes);
    }

    private static Fixture CreateFixture(
        int cacheTtlMs = 0,
        IGameInputActivityGate? activityGate = null)
    {
        var options = new CoreHostOptions
        {
            Core = new CoreApiOptions { AllowRawConsoleCommand = true },
            Console = new ConsoleAutomationOptions
            {
                OpenMode = "NumpadSubtractOnce",
                CloseMode = "NumpadSubtractOnce",
                CommandInputMode = "Unicode"
            },
            Timing = new TimingOptions
            {
                FocusTimeoutMs = 20,
                ClipboardChangeTimeoutMs = 100,
                ClipboardSequencePollIntervalMs = 1,
                CommandTimeoutMs = 1000,
                ListPlayersCacheTtlMs = cacheTtlMs
            }
        };
        var optionsMonitor = new StaticOptionsMonitor(options);
        var windowApi = new FakeWindowApi
        {
            OwnerProcessId = unchecked((uint)OverlayTarget.ProcessId),
            ForegroundWindowHandle = OverlayTarget.WindowHandle,
            UpdateForegroundWindowOnSuccess = true
        };
        var foreground = new ForegroundWindowService(windowApi);
        var keyboard = new FakeKeyboardInputApi();
        var sendInput = new SendInputService(keyboard);
        var cleanup = new ConsoleCommandCleanupService(
            optionsMonitor,
            sendInput,
            new RestoreTargetValidator(windowApi),
            foreground);
        var targets = new FakeExecutionTargetResolver();
        var clipboard = new FakeClipboardService();
        var gate = new ConsoleCommandGate();
        var activity = activityGate ?? new FakeGameInputActivityGate();
        var batchService = new ConsoleCommandBatchService(
            gate,
            new ConsoleBatchRuntime(
                optionsMonitor,
                targets,
                foreground,
                sendInput,
                cleanup,
                clipboard),
            optionsMonitor,
            activity);
        var service = new ConsoleCommandService(
            optionsMonitor,
            gate,
            targets,
            foreground,
            sendInput,
            cleanup,
            clipboard,
            new ListPlayersParser(),
            activity,
            batchService);

        return new Fixture(service, targets, clipboard, keyboard, windowApi, gate);
    }

    private static ConsoleCommandBatchService CreateBatchService(
        ConsoleCommandGate gate,
        IConsoleBatchRuntime runtime)
    {
        return new ConsoleCommandBatchService(
            gate,
            runtime,
            new StaticOptionsMonitor(new CoreHostOptions()),
            new FakeGameInputActivityGate());
    }

    private static string ListPlayersOutput(string playerName, bool includeWarning = false)
    {
        var lines = new List<string>
        {
            "ServerName - Test Server 127.0.0.1:7777",
            "Name - PlayFabPlayerId - EOSPlayerId - Score - Kills - Deaths - Ping",
            $"{playerName} - PLAYFAB_1 - EOS_1 - 100 - 1 - 0 - 20 ms"
        };
        if (includeWarning)
        {
            lines.Add("!");
        }

        return string.Join('\n', lines);
    }

    private sealed record Fixture(
        ConsoleCommandService Service,
        FakeExecutionTargetResolver Targets,
        FakeClipboardService Clipboard,
        FakeKeyboardInputApi Keyboard,
        FakeWindowApi WindowApi,
        ConsoleCommandGate Gate);

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

    private sealed class FakeExecutionTargetResolver : IConsoleExecutionTargetResolver
    {
        public Queue<ValidatedRestoreTarget> ResolutionTargets { get; } = [];

        public RestoreTargetValidationResult ResolutionResult { get; set; } =
            Success(GameTarget);

        public RestoreTargetValidationResult ValidationResult { get; set; } =
            Success(GameTarget);

        public List<bool> ResolveBackgroundValues { get; } = [];

        public List<bool> RequireForegroundValues { get; } = [];

        public TaskCompletionSource ValidationStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public RestoreTargetValidationResult Resolve(JsonElement? restoreTarget, bool background)
        {
            ResolveBackgroundValues.Add(background);
            if (ResolutionTargets.TryDequeue(out var target))
            {
                return Success(target);
            }

            if (!ResolutionResult.Ok)
            {
                return ResolutionResult;
            }

            return background ? ResolutionResult : Success(OverlayTarget);
        }

        public RestoreTargetValidationResult Validate(
            ValidatedRestoreTarget target,
            bool requireForeground)
        {
            RequireForegroundValues.Add(requireForeground);
            ValidationStarted.TrySetResult();
            return ValidationResult.Ok ? Success(target) : ValidationResult;
        }

        public RestoreTargetValidationResult ResolveGameTarget(
            ValidatedRestoreTarget leaseTarget,
            bool background)
        {
            return Success(background ? leaseTarget : GameTarget);
        }

        private static RestoreTargetValidationResult Success(ValidatedRestoreTarget target)
        {
            return new RestoreTargetValidationResult(true, target, null, null);
        }
    }

    private sealed class FakeClipboardService : IClipboardService
    {
        private int _readCalls;
        private uint _sequence;

        public Queue<ClipboardTextResult> Reads { get; } = [];

        public List<string> Writes { get; } = [];

        public Func<int, Task<ClipboardTextResult>>? OnReadAsync { get; set; }

        public TaskCompletionSource ReadStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public uint GetSequenceNumber() => ++_sequence;

        public async Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            _readCalls++;
            ReadStarted.TrySetResult();
            if (OnReadAsync is not null)
            {
                return await OnReadAsync(_readCalls);
            }

            return Reads.TryDequeue(out var result)
                ? result
                : ClipboardTextResult.NoText();
        }

        public Task<OperationResult> SetTextAsync(string text, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Writes.Add(text);
            return Task.FromResult(OperationResult.Success());
        }
    }

    private sealed class GateBatchRuntime : IConsoleBatchRuntime
    {
        public TaskCompletionSource ValidationStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public TaskCompletionSource SubmitStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Task? BlockSubmitUntil { get; init; }

        public RestoreTargetValidationResult ResolveExecutionTarget(
            JsonElement? restoreTarget,
            bool background)
        {
            return Success(GameTarget);
        }

        public RestoreTargetValidationResult ValidateExecutionTarget(
            ValidatedRestoreTarget restoreTarget,
            bool requireForeground)
        {
            ValidationStarted.TrySetResult();
            return Success(restoreTarget);
        }

        public Task<OperationResult> FocusGameAsync(
            ValidatedRestoreTarget leaseTarget,
            bool background,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(OperationResult.Success());
        }

        public async Task<ConsoleCommandSubmitResult> SubmitAsync(
            PreparedConsoleCommand command,
            ConsoleOpenAttemptState attempt,
            CancellationToken cancellationToken)
        {
            SubmitStarted.TrySetResult();
            if (BlockSubmitUntil is not null)
            {
                await BlockSubmitUntil.WaitAsync(cancellationToken);
            }

            return new ConsoleCommandSubmitResult(
                OperationResult.Success(),
                EnterSent: true,
                Cancelled: false);
        }

        public Task<ConsoleExecutionResult> CompleteAsync(
            ConsoleExecutionResult result,
            ConsoleOpenAttemptState attempt,
            ValidatedRestoreTarget restoreTarget,
            bool restoreForeground)
        {
            return Task.FromResult(result);
        }

        private static RestoreTargetValidationResult Success(
            ValidatedRestoreTarget target)
        {
            return new RestoreTargetValidationResult(true, target, null, null);
        }
    }

    private sealed class StaticOptionsMonitor(CoreHostOptions options)
        : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue => options;

        public CoreHostOptions Get(string? name) => options;

        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
