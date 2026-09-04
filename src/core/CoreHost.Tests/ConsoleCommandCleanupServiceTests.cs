using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests;

public sealed class ConsoleCommandCleanupServiceTests
{
    private const int ProcessId = 4321;
    private static readonly IntPtr RestoreWindow = new(0x1234);
    private static readonly IntPtr GameWindow = new(0x5678);
    private static readonly ValidatedRestoreTarget RestoreTarget = new(ProcessId, RestoreWindow);

    [Fact]
    public async Task SuccessPreservesResultAndRestoresExactTarget()
    {
        var (windowApi, _, service) = CreateSubject();
        var result = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { sent = true });

        var completed = await service.CompleteAsync(result, consoleMayBeOpen: false, commandSubmitted: false, RestoreTarget);

        Assert.Equal(result, completed);
        Assert.Equal(RestoreWindow, windowApi.ForegroundWindowHandle);
    }

    [Theory]
    [InlineData("INPUT_FAILED", StatusCodes.Status409Conflict)]
    [InlineData("COMMAND_TIMEOUT", StatusCodes.Status504GatewayTimeout)]
    public async Task FailureRemainsPrimaryAndStillRestores(string errorCode, int statusCode)
    {
        var (windowApi, _, service) = CreateSubject();
        var result = ConsoleExecutionResult.Failure(errorCode, "Command failed.", "request-1", statusCode);

        var completed = await service.CompleteAsync(result, consoleMayBeOpen: false, commandSubmitted: false, RestoreTarget);

        Assert.False(completed.Ok);
        Assert.Equal(errorCode, completed.ErrorCode);
        Assert.Equal(statusCode, completed.StatusCode);
        Assert.Equal(RestoreWindow, windowApi.ForegroundWindowHandle);
    }

    [Theory]
    [InlineData("disappeared")]
    [InlineData("hidden")]
    [InlineData("reowned")]
    public async Task LostTargetAddsWarningWithoutRequestingFocus(string targetState)
    {
        var (windowApi, _, service) = CreateSubject();
        switch (targetState)
        {
            case "disappeared":
                windowApi.WindowExists = false;
                break;
            case "hidden":
                windowApi.WindowVisible = false;
                break;
            case "reowned":
                windowApi.OwnerProcessId = ProcessId + 1;
                break;
        }

        var result = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { sent = true });

        var completed = await service.CompleteAsync(result, consoleMayBeOpen: false, commandSubmitted: false, RestoreTarget);

        Assert.Equal(["RESTORE_TARGET_LOST"], completed.Warnings);
        Assert.DoesNotContain(nameof(FakeWindowApi.SetForegroundWindow), windowApi.Calls);
    }

    [Fact]
    public async Task UnrestorableOwnedTargetAddsRestoreWarning()
    {
        var (windowApi, _, service) = CreateSubject();
        windowApi.SetForegroundWindowResult = false;
        windowApi.UpdateForegroundWindowOnSuccess = false;

        var result = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { sent = true });

        var completed = await service.CompleteAsync(result, consoleMayBeOpen: false, commandSubmitted: false, RestoreTarget);

        Assert.Equal(["FOREGROUND_RESTORE_FAILED"], completed.Warnings);
        Assert.Contains(nameof(FakeWindowApi.SetForegroundWindow), windowApi.Calls);
    }

    [Fact]
    public async Task OpenConsoleClosesBeforeRestoreRequest()
    {
        var (windowApi, cleanupInput, service) = CreateSubject(closeMode: "NumpadSubtractOnce");
        bool? restoreRequestedAtClose = null;
        cleanupInput.OnClose = () =>
            restoreRequestedAtClose = windowApi.Calls.Contains(nameof(FakeWindowApi.SetForegroundWindow));

        var result = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { sent = true });

        await service.CompleteAsync(result, consoleMayBeOpen: true, commandSubmitted: true, RestoreTarget);

        Assert.Equal(1, cleanupInput.CloseCalls);
        Assert.False(restoreRequestedAtClose);
        Assert.False(cleanupInput.LastCancellationToken.CanBeCanceled);
        Assert.Contains(nameof(FakeWindowApi.SetForegroundWindow), windowApi.Calls);
    }

    [Fact]
    public async Task ConsoleCloseFailureAddsWarningAndStillRestores()
    {
        var (windowApi, cleanupInput, service) = CreateSubject(closeMode: "NumpadSubtractOnce");
        cleanupInput.CloseResult = OperationResult.Failure("CONSOLE_CLOSE_FAILED", "Console close failed.");

        var result = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { sent = true });

        var completed = await service.CompleteAsync(result, consoleMayBeOpen: true, commandSubmitted: true, RestoreTarget);

        Assert.Equal(["CONSOLE_CLOSE_FAILED"], completed.Warnings);
        Assert.Equal(RestoreWindow, windowApi.ForegroundWindowHandle);
    }

    [Fact]
    public async Task BackgroundCleanupClosesConsoleWithoutInspectingOrRestoringTheTarget()
    {
        var (windowApi, cleanupInput, service) = CreateSubject(closeMode: "NumpadSubtractOnce");
        windowApi.WindowExists = false;
        var result = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { sent = true });

        var completed = await service.CompleteAsync(
            result,
            consoleMayBeOpen: true,
            commandSubmitted: true,
            RestoreTarget,
            restoreForeground: false);

        Assert.Empty(completed.Warnings);
        Assert.Equal(1, cleanupInput.CloseCalls);
        Assert.DoesNotContain(nameof(FakeWindowApi.IsWindow), windowApi.Calls);
        Assert.DoesNotContain(nameof(FakeWindowApi.SetForegroundWindow), windowApi.Calls);
    }

    [Fact]
    public async Task PreExistingWarningsAreRetainedAndDeduplicated()
    {
        var (windowApi, _, service) = CreateSubject();
        windowApi.SetForegroundWindowResult = false;
        windowApi.UpdateForegroundWindowOnSuccess = false;
        var result = ConsoleExecutionResult.Success(
            "request-1",
            "ListPlayers",
            new { sent = true },
            ["LISTPLAYERS_PARSE_PARTIAL", "FOREGROUND_RESTORE_FAILED"]);

        var completed = await service.CompleteAsync(result, consoleMayBeOpen: false, commandSubmitted: false, RestoreTarget);

        Assert.Equal(
            ["LISTPLAYERS_PARSE_PARTIAL", "FOREGROUND_RESTORE_FAILED"],
            completed.Warnings);
    }

    [Fact]
    public async Task OptionsReadFailureAddsWarningWithoutReplacingResultOrSkippingRestoration()
    {
        var (windowApi, cleanupInput, service) = CreateSubject(optionsReadFails: true);
        var result = ConsoleExecutionResult.Failure(
            "COMMAND_TIMEOUT",
            "Console command execution timed out.",
            "request-1",
            StatusCodes.Status504GatewayTimeout);

        var completed = await service.CompleteAsync(result, consoleMayBeOpen: true, commandSubmitted: false, RestoreTarget);

        Assert.False(completed.Ok);
        Assert.Equal("COMMAND_TIMEOUT", completed.ErrorCode);
        Assert.Equal(StatusCodes.Status504GatewayTimeout, completed.StatusCode);
        Assert.Equal(["INPUT_FAILED"], completed.Warnings);
        Assert.Equal(0, cleanupInput.CloseCalls);
        Assert.Equal(RestoreWindow, windowApi.ForegroundWindowHandle);
    }

    [Fact]
    public async Task NoCloseModeAfterSubmittedCommandSendsNoExtraInputOrWarning()
    {
        var (windowApi, cleanupInput, service) = CreateSubject();
        var result = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { sent = true });

        var completed = await service.CompleteAsync(
            result,
            consoleMayBeOpen: true,
            commandSubmitted: true,
            RestoreTarget);

        Assert.Empty(completed.Warnings);
        Assert.Equal(0, cleanupInput.CloseCalls);
        Assert.Equal(RestoreWindow, windowApi.ForegroundWindowHandle);
    }

    [Fact]
    public async Task NoCloseModeBeforeCommandSubmissionWarnsAndStillRestores()
    {
        var (windowApi, cleanupInput, service) = CreateSubject();
        var result = ConsoleExecutionResult.Failure("COMMAND_TIMEOUT", "Command cancelled.", "request-1");

        var completed = await service.CompleteAsync(
            result,
            consoleMayBeOpen: true,
            commandSubmitted: false,
            RestoreTarget);

        Assert.Equal(["CONSOLE_CLOSE_NOT_CONFIGURED"], completed.Warnings);
        Assert.Equal(0, cleanupInput.CloseCalls);
        Assert.Equal(RestoreWindow, windowApi.ForegroundWindowHandle);
    }

    [Fact]
    public async Task PartialOpenCancellationStateReachesConfiguredCloseBeforeRestore()
    {
        using var cancellation = new CancellationTokenSource();
        var windowApi = CreateWindowApi();
        bool? restoreRequestedAtClose = null;
        var inputApi = new FakeKeyboardInputApi
        {
            OnSend = sendCall =>
            {
                if (sendCall == 1)
                {
                    cancellation.Cancel();
                }
                else
                {
                    restoreRequestedAtClose = windowApi.Calls.Contains(nameof(FakeWindowApi.SetForegroundWindow));
                }
            }
        };
        var sendInput = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            sendInput.SendConsoleOpenSequenceAsync(
                new ConsoleAutomationOptions { OpenMode = "NumpadSubtractOnce" },
                new TimingOptions { BetweenKeyDelayMs = 100 },
                attempt,
                cancellation.Token));

        var service = CreateService(windowApi, sendInput, "NumpadSubtractOnce");
        var result = ConsoleExecutionResult.Failure("COMMAND_TIMEOUT", "Command cancelled.", "request-1");
        await service.CompleteAsync(result, attempt.MayBeOpen, attempt.CommandSubmitted, RestoreTarget);

        Assert.True(attempt.MayBeOpen);
        Assert.False(attempt.CommandSubmitted);
        Assert.Equal(2, inputApi.SendCalls);
        Assert.False(restoreRequestedAtClose);
        Assert.Contains(nameof(FakeWindowApi.SetForegroundWindow), windowApi.Calls);
    }

    [Fact]
    public async Task NullCloseModeAddsInputWarningAndStillRestores()
    {
        var windowApi = CreateWindowApi();
        var sendInput = new SendInputService(new FakeKeyboardInputApi());
        var service = CreateService(windowApi, sendInput, closeMode: null);
        var result = ConsoleExecutionResult.Failure("COMMAND_TIMEOUT", "Command cancelled.", "request-1");

        var completed = await service.CompleteAsync(
            result,
            consoleMayBeOpen: true,
            commandSubmitted: false,
            RestoreTarget);

        Assert.Equal(["INPUT_FAILED"], completed.Warnings);
        Assert.Equal(RestoreWindow, windowApi.ForegroundWindowHandle);
    }

    private static (FakeWindowApi WindowApi, FakeConsoleCleanupInput CleanupInput, ConsoleCommandCleanupService Service) CreateSubject(
        bool optionsReadFails = false,
        string closeMode = "None")
    {
        var windowApi = CreateWindowApi();
        var cleanupInput = new FakeConsoleCleanupInput();
        var service = CreateService(windowApi, cleanupInput, closeMode, optionsReadFails);

        return (windowApi, cleanupInput, service);
    }

    private static FakeWindowApi CreateWindowApi()
    {
        return new FakeWindowApi
        {
            OwnerProcessId = ProcessId,
            ForegroundWindowHandle = GameWindow,
            UpdateForegroundWindowOnSuccess = true
        };
    }

    private static ConsoleCommandCleanupService CreateService(
        FakeWindowApi windowApi,
        IConsoleCleanupInput cleanupInput,
        string? closeMode,
        bool optionsReadFails = false)
    {
        var options = new CoreHostOptions
        {
            Console = new ConsoleAutomationOptions { CloseMode = closeMode! },
            Timing = new TimingOptions
            {
                FocusTimeoutMs = 20,
                RestoreFocusDelayMs = 0
            }
        };
        var optionsMonitor = new StaticOptionsMonitor(options)
        {
            ThrowOnRead = optionsReadFails
        };
        var service = new ConsoleCommandCleanupService(
            optionsMonitor,
            cleanupInput,
            new RestoreTargetValidator(windowApi),
            new ForegroundWindowService(windowApi));
        return service;
    }

    private sealed class FakeConsoleCleanupInput : IConsoleCleanupInput
    {
        public OperationResult CloseResult { get; set; } = OperationResult.Success();

        public Action? OnClose { get; set; }

        public int CloseCalls { get; private set; }

        public CancellationToken LastCancellationToken { get; private set; }

        public Task<OperationResult> SendConsoleCloseSequenceAsync(
            ConsoleAutomationOptions console,
            TimingOptions timing,
            CancellationToken cancellationToken)
        {
            CloseCalls++;
            LastCancellationToken = cancellationToken;
            OnClose?.Invoke();
            return Task.FromResult(CloseResult);
        }
    }

    private sealed class StaticOptionsMonitor(CoreHostOptions options) : IOptionsMonitor<CoreHostOptions>
    {
        public bool ThrowOnRead { get; init; }

        public CoreHostOptions CurrentValue => ThrowOnRead
            ? throw new InvalidOperationException("Options reload failed.")
            : options;

        public CoreHostOptions Get(string? name) => options;

        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
