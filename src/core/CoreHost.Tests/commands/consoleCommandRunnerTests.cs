using CoreHost.Actions;
using CoreHost.Clipboard;
using CoreHost.Commands;
using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests.Commands;

public sealed class ConsoleCommandRunnerTests
{
    [Fact]
    public async Task submissionReceiptPrecedesCallbacksAndSurvivesPostSubmitFailure()
    {
        var activity = new ConsoleCommandActivity();
        var subject = runner(new(), new(), activity);
        var context = new ConsoleSubmissionContext("action", 4, "user", 11, 22);
        var result = await subject.run(new("console", "Serversay test", "NumpadSubtract"), () => { }, () => {
            Assert.Equal(4, Assert.Single(activity.readCommands(0).Commands).CommandIndex);
            throw new InvalidOperationException("after submission");
        }, TestContext.Current.CancellationToken, context: context);
        Assert.True(result.Sent);
        Assert.Equal("INPUT_FAILED", result.ErrorCode);
        Assert.Single(activity.readCommands(0).Commands);
    }

    [Fact]
    public async Task unsentCommandDoesNotCreateReceipt()
    {
        var activity = new ConsoleCommandActivity();
        var subject = runner(new(), new() { FailWrite = true }, activity);
        var result = await subject.run(new("console", "Serversay test", "NumpadSubtract"), () => { }, () => { },
            TestContext.Current.CancellationToken, context: new("action", 0, "user", 11, 22));
        Assert.False(result.Sent);
        Assert.Empty(activity.readCommands(0).Commands);
    }

    [Fact]
    public async Task changedClipboardNeverGetsPastedOrSubmitted()
    {
        var clipboard = new FakeClipboard();
        var native = new FakeKeyboardInputApi { OnSend = _ => clipboard.external("user text") };
        var subject = runner(native, clipboard);
        var submitted = false;
        var result = await subject.run(new("console", "Adminsay test", "NumpadSubtract"), () => { }, () => submitted = true, TestContext.Current.CancellationToken);
        Assert.False(submitted);
        Assert.Equal("CLIPBOARD_CHANGED", result.ErrorCode);
        Assert.Single(native.InputBatches);
        Assert.Equal("user text", clipboard.Text);
        Assert.True(subject.needsCleanup);
    }

    [Fact]
    public async Task cancellationAfterSubmissionRetainsSuccessAndRestoresClipboard()
    {
        using var stop = new CancellationTokenSource();
        var clipboard = new FakeClipboard();
        var subject = runner(new(), clipboard);
        var result = await subject.run(new("console", "Adminsay test", "NumpadSubtract"), () => { }, stop.Cancel, stop.Token);
        Assert.True(result.Sent);
        Assert.Null(result.ErrorCode);
        Assert.Equal("original", clipboard.Text);
        Assert.False(subject.needsCleanup);
    }

    [Fact]
    public async Task failedWriteNeverRestoresOverNewUserClipboard()
    {
        var clipboard = new FakeClipboard();
        var subject = new CommandClipboard(clipboard);
        await subject.write("first", true, TestContext.Current.CancellationToken);
        await subject.restore(TestContext.Current.CancellationToken);
        clipboard.FailWrite = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => subject.write("second", true, TestContext.Current.CancellationToken));
        clipboard.external("new user text");
        await subject.restore(TestContext.Current.CancellationToken);
        Assert.Equal("new user text", clipboard.Text);
    }

    private static ConsoleCommandRunner runner(FakeKeyboardInputApi native, FakeClipboard clipboard, ConsoleCommandActivity? activity = null) => new(
        new(native), new(clipboard), new(new ListPlayersTextNormalizer()), activity ?? new(), new FixedOptions());

    private sealed class FixedOptions : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue { get; } = new();
        public CoreHostOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }

    private sealed class FakeClipboard : IClipboardService
    {
        public string Text { get; private set; } = "original";
        public bool FailWrite;
        private uint sequence = 1;
        public void external(string text) { Text = text; sequence++; }
        public uint GetSequenceNumber() => sequence;
        public Task<ClipboardTextResult> ReadTextAsync(CancellationToken token) => Task.FromResult(ClipboardTextResult.TextValue(Text));
        public Task<OperationResult> SetTextAsync(string text, CancellationToken token, uint? expectedSequence = null)
        {
            if (FailWrite) return Task.FromResult(OperationResult.Failure("FAIL", "Write failed"));
            if (expectedSequence is { } expected && sequence != expected) return Task.FromResult(OperationResult.Failure("CLIPBOARD_CHANGED", "Changed"));
            external(text);
            return Task.FromResult(OperationResult.Success());
        }
    }
}
