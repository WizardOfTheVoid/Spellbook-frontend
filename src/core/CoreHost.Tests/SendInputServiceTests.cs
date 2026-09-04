using System.Diagnostics;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;
using CoreHost.Win32;

namespace CoreHost.Tests;

public sealed class SendInputServiceTests
{
    private const uint KeyUp = 0x0002;

    [Fact]
    public async Task InstantVirtualKeyPressSendsKeyDownAndKeyUpTogether()
    {
        var inputApi = new FakeKeyboardInputApi();
        var service = new SendInputService(inputApi);

        var result = await service.PressVirtualKeyAsync(
            virtualKey: 0x20,
            durationMs: 0,
            CancellationToken.None);

        Assert.True(result.Ok);
        var inputs = Assert.Single(inputApi.InputBatches);
        Assert.Equal(
        [
            new KeyboardInputEvent(0x20, 0, 0),
            new KeyboardInputEvent(0x20, 0, KeyUp)
        ],
            inputs);
    }

    [Fact]
    public async Task TimedVirtualKeyPressReleasesKeyAfterCancellation()
    {
        using var cancellation = new CancellationTokenSource();
        var inputApi = new FakeKeyboardInputApi
        {
            OnSend = call =>
            {
                if (call == 1) cancellation.Cancel();
            }
        };
        var service = new SendInputService(inputApi);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.PressVirtualKeyAsync(
                virtualKey: 0x20,
                durationMs: 100,
                cancellation.Token));

        Assert.Equal(2, inputApi.InputBatches.Count);
        Assert.Equal([new KeyboardInputEvent(0x20, 0, 0)], inputApi.InputBatches[0]);
        Assert.Equal([new KeyboardInputEvent(0x20, 0, KeyUp)], inputApi.InputBatches[1]);
    }

    [Fact]
    public async Task OpenAttemptRemainsObservableWhenCancellationFollowsNativeInput()
    {
        using var cancellation = new CancellationTokenSource();
        var inputApi = new FakeKeyboardInputApi
        {
            OnSend = _ => cancellation.Cancel()
        };
        var service = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.SendConsoleOpenSequenceAsync(
                new ConsoleAutomationOptions { OpenMode = "NumpadSubtractOnce" },
                new TimingOptions { BetweenKeyDelayMs = 100 },
                attempt,
                cancellation.Token));

        Assert.True(attempt.MayBeOpen);
        Assert.False(attempt.CommandSubmitted);
        Assert.Equal(1, inputApi.SendCalls);
    }

    [Fact]
    public async Task PartialOpenInputFailureMarksConsoleAsPossiblyOpen()
    {
        var inputApi = new FakeKeyboardInputApi
        {
            Sent = 1,
            Error = 5
        };
        var service = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        var result = await service.SendConsoleOpenSequenceAsync(
            new ConsoleAutomationOptions { OpenMode = "NumpadSubtractOnce" },
            new TimingOptions(),
            attempt,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INPUT_FAILED", result.ErrorCode);
        Assert.True(attempt.MayBeOpen);
        Assert.False(attempt.CommandSubmitted);
    }

    [Theory]
    [InlineData("None", true)]
    [InlineData("UnsupportedMode", false)]
    public async Task NonSendingOpenModesDoNotMarkConsoleAsPossiblyOpen(string openMode, bool expectedSuccess)
    {
        var inputApi = new FakeKeyboardInputApi();
        var service = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        var result = await service.SendConsoleOpenSequenceAsync(
            new ConsoleAutomationOptions { OpenMode = openMode },
            new TimingOptions(),
            attempt,
            CancellationToken.None);

        Assert.Equal(expectedSuccess, result.Ok);
        Assert.False(attempt.MayBeOpen);
        Assert.False(attempt.CommandSubmitted);
        Assert.Equal(0, inputApi.SendCalls);
    }

    [Fact]
    public async Task ZeroNativeInputsSentDoesNotMarkConsoleAsPossiblyOpen()
    {
        var inputApi = new FakeKeyboardInputApi
        {
            Sent = 0,
            Error = 5
        };
        var service = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        var result = await service.SendConsoleOpenSequenceAsync(
            new ConsoleAutomationOptions { OpenMode = "NumpadSubtractOnce" },
            new TimingOptions(),
            attempt,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.False(attempt.MayBeOpen);
        Assert.False(attempt.CommandSubmitted);
        Assert.Equal(1, inputApi.SendCalls);
    }

    [Fact]
    public async Task SuccessfulEnterMarksCommandSubmittedBeforeCancellableDelay()
    {
        using var cancellation = new CancellationTokenSource();
        var inputApi = new FakeKeyboardInputApi
        {
            OnSend = _ => cancellation.Cancel()
        };
        var service = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            service.PressEnterAsync(
                new TimingOptions { BetweenKeyDelayMs = 100 },
                attempt,
                cancellation.Token));

        Assert.True(attempt.CommandSubmitted);
    }

    [Fact]
    public async Task CancellationAfterEnterDoesNotSkipAfterActionDelay()
    {
        using var cancellation = new CancellationTokenSource();
        var inputApi = new FakeKeyboardInputApi
        {
            OnSend = _ => cancellation.Cancel()
        };
        var service = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        var startedAt = Stopwatch.GetTimestamp();
        var result = await service.PressEnterAsync(
            new TimingOptions { AfterActionMs = 60 },
            attempt,
            cancellation.Token);

        Assert.True(result.Ok);
        Assert.True(attempt.CommandSubmitted);
        Assert.True(
            Stopwatch.GetElapsedTime(startedAt) >= TimeSpan.FromMilliseconds(45),
            "Expected the post-action settle to survive request cancellation.");
    }

    [Fact]
    public async Task PartialEnterInputFailureStillMarksCommandSubmitted()
    {
        var inputApi = new FakeKeyboardInputApi
        {
            Sent = 1,
            Error = 5
        };
        var service = new SendInputService(inputApi);
        var attempt = new ConsoleOpenAttemptState();

        var result = await service.PressEnterAsync(
            new TimingOptions(),
            attempt,
            CancellationToken.None);

        Assert.False(result.Ok);
        Assert.Equal("INPUT_FAILED", result.ErrorCode);
        Assert.True(attempt.CommandSubmitted);
        Assert.Equal(1, inputApi.SendCalls);
    }
}
