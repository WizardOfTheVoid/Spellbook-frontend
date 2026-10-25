using CoreHost.Actions;
using CoreHost.Clipboard;
using CoreHost.Commands;
using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;
using CoreHost.KeyboardLayouts;
using CoreHost.Tests.KeyboardLayouts;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests.Commands;

public sealed class ConsoleCommandRunnerTests
{
    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    [InlineData(3)]
    public async Task cancellationAfterInputRetainsSettlingBeforeRestoration(int cancelAfter)
    {
        using var stop = new CancellationTokenSource();
        var api = new FakeKeyboardLayoutApi();
        long injected = 0, restored = 0;
        var native = new FakeKeyboardInputApi { OnSend = call => {
            if (call == 1) Thread.Sleep(80);
            injected = System.Diagnostics.Stopwatch.GetTimestamp();
            if (call == cancelAfter) stop.Cancel();
        } };
        api.onRequest = id => { if (id == "00000409") restored = System.Diagnostics.Stopwatch.GetTimestamp(); };
        var options = new KeyboardLayoutLeaseTests.LayoutOptions();
        options.CurrentValue.KeyboardLayouts.InputSettleMs = 70;
        var input = new InputActivityTracker();
        input.setAvailable(true);
        var keyboard = new KeyboardInput(native);
        var layouts = new KeyboardLayoutService(api, input, keyboard, options);
        var subject = new ConsoleCommandRunner(keyboard, new(new FakeClipboard()), new(new ListPlayersTextNormalizer()), new(), options, layouts);
        var result = await subject.run(new("console", "SpellBookLayoutProbe", "Minus", KeyboardLayoutId: "00000414"), KeyboardLayoutCatalogTests.game,
            stop.Token.ThrowIfCancellationRequested, () => { }, stop.Token);
        Assert.Equal(cancelAfter == 3, result.Sent);
        var settledMs = System.Diagnostics.Stopwatch.GetElapsedTime(injected, restored).TotalMilliseconds;
        Assert.True(settledMs >= 60, $"Settled {settledMs:F2}ms; sends={native.SendCalls}, result={result.ErrorCode}, injected={injected}, restored={restored}");
        Assert.Equal("00000409", api.current);
    }

    [Fact]
    public async Task cancelledDiscardRetainsSettlingBeforeRestoration()
    {
        using var stop = new CancellationTokenSource();
        var api = new FakeKeyboardLayoutApi();
        var clipboard = new FakeClipboard();
        long injected = 0, restored = 0;
        var native = new FakeKeyboardInputApi { OnSend = call => {
            if (call == 1) clipboard.external("new clipboard");
            if (call == 2) { Thread.Sleep(80); injected = System.Diagnostics.Stopwatch.GetTimestamp(); stop.Cancel(); }
        } };
        var options = new KeyboardLayoutLeaseTests.LayoutOptions();
        options.CurrentValue.KeyboardLayouts.InputSettleMs = 70;
        var input = new InputActivityTracker();
        input.setAvailable(true);
        var keyboard = new KeyboardInput(native);
        var layouts = new KeyboardLayoutService(api, input, keyboard, options);
        var subject = new ConsoleCommandRunner(keyboard, new(clipboard), new(new ListPlayersTextNormalizer()), new(), options, layouts);
        await subject.run(new("console", "SpellBookLayoutProbe", "Minus", KeyboardLayoutId: "00000414"), KeyboardLayoutCatalogTests.game,
            () => { }, () => { }, TestContext.Current.CancellationToken);
        api.onRequest = id => { if (id == "00000409") restored = System.Diagnostics.Stopwatch.GetTimestamp(); };
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => subject.consoleDiscard(KeyboardLayoutCatalogTests.game, stop.Token.ThrowIfCancellationRequested, stop.Token));
        Assert.True(System.Diagnostics.Stopwatch.GetElapsedTime(injected, restored).TotalMilliseconds >= 60);
    }

    [Fact]
    public async Task deferredDiscardReacquiresItsLayoutAndRestoresTheCurrentLayout()
    {
        var api = new FakeKeyboardLayoutApi();
        var clipboard = new FakeClipboard();
        var native = new FakeKeyboardInputApi { OnSend = call => { if (call == 1) clipboard.external("new clipboard"); } };
        var keyboard = new KeyboardInput(native);
        var options = new KeyboardLayoutLeaseTests.LayoutOptions();
        var layouts = KeyboardLayoutLeaseTests.service(api);
        var subject = new ConsoleCommandRunner(keyboard, new(clipboard), new(new ListPlayersTextNormalizer()), new(), options, layouts);
        var result = await subject.run(new("console", "SpellBookLayoutProbe", "Minus", KeyboardLayoutId: "00000414"), KeyboardLayoutCatalogTests.game,
            () => { }, () => { }, TestContext.Current.CancellationToken);
        Assert.False(result.Sent);
        Assert.True(subject.needsCleanup);
        api.current = "00000809";
        await subject.consoleDiscard(KeyboardLayoutCatalogTests.game, () => { }, TestContext.Current.CancellationToken);
        Assert.False(subject.needsCleanup);
        Assert.Equal("00000809", api.current);
        Assert.Equal(new[] { "00000414", "00000409", "00000414", "00000809" }, api.requests);
        Assert.Equal(3, native.InputBatches.Count);
    }

    [Fact]
    public async Task restorationFailureRetainsSubmissionReceiptAndBlocksFurtherInput()
    {
        var api = new FakeKeyboardLayoutApi();
        var native = new FakeKeyboardInputApi { OnSend = call => { if (call == 3) api.apply = false; } };
        var activity = new ConsoleCommandActivity();
        var options = new KeyboardLayoutLeaseTests.LayoutOptions();
        var layouts = KeyboardLayoutLeaseTests.service(api);
        var subject = new ConsoleCommandRunner(new(native), new(new FakeClipboard()), new(new ListPlayersTextNormalizer()), activity, options, layouts);
        var result = await subject.run(new("console", "SpellBookLayoutProbe", "Minus", KeyboardLayoutId: "00000414"), KeyboardLayoutCatalogTests.game,
            () => { }, () => { }, TestContext.Current.CancellationToken, context: new("restore-failure", 0, "user", 11, 22));
        Assert.True(result.Sent);
        Assert.Equal("KEYBOARD_LAYOUT_RESTORE_FAILED", result.ErrorCode);
        Assert.Single(activity.readCommands(0).Commands);
        Assert.NotNull(layouts.pendingRestoration);
        Assert.Equal(3, native.InputBatches.Count);
    }

    [Fact]
    public async Task unconfirmedSwitchSendsNoInput()
    {
        var native = new FakeKeyboardInputApi();
        var api = new FakeKeyboardLayoutApi { apply = false };
        var input = new InputActivityTracker();
        input.setAvailable(true);
        var keyboard = new KeyboardInput(native);
        var options = new KeyboardLayoutLeaseTests.LayoutOptions();
        var layouts = new KeyboardLayoutService(api, input, keyboard, options);
        var subject = new ConsoleCommandRunner(keyboard, new(new FakeClipboard()), new(new ListPlayersTextNormalizer()), new(), options, layouts);
        var result = await subject.run(new("console", "SpellBookLayoutProbe", "Minus", KeyboardLayoutId: "00000414"), KeyboardLayoutCatalogTests.game,
            () => { }, () => { }, TestContext.Current.CancellationToken);
        Assert.False(result.Sent);
        Assert.Equal("KEYBOARD_LAYOUT_SWITCH_FAILED", result.ErrorCode);
        Assert.Empty(native.InputBatches);
    }

    [Fact]
    public async Task originalLayoutIsRestoredBeforeOutputWaitAndSubmittedCommandIsNotReplayed()
    {
        var api = new FakeKeyboardLayoutApi();
        var clipboard = new FakeClipboard();
        var native = new FakeKeyboardInputApi { OnSend = call => { if (call == 3) clipboard.external("output"); } };
        var keyboard = new KeyboardInput(native);
        var options = new KeyboardLayoutLeaseTests.LayoutOptions();
        var layouts = KeyboardLayoutLeaseTests.service(api);
        clipboard.onRead = () => { if (clipboard.Text == "output") Assert.Equal("00000409", api.current); };
        var subject = new ConsoleCommandRunner(keyboard, new(clipboard), new(new ListPlayersTextNormalizer()), new(), options, layouts);
        var result = await subject.run(new("console", "SpellBookLayoutProbe", "Minus", ExpectClipboard: true, KeyboardLayoutId: "00000414"), KeyboardLayoutCatalogTests.game,
            () => { }, () => { }, TestContext.Current.CancellationToken);
        Assert.True(result.Sent);
        Assert.Null(result.ErrorCode);
        Assert.Equal("00000414", result.KeyboardLayout?.Id);
        Assert.Equal(3, native.InputBatches.Count);
        Assert.Equal("00000409", api.current);
    }
    [Fact]
    public async Task submissionReceiptPrecedesCallbacksAndSurvivesPostSubmitFailure()
    {
        var activity = new ConsoleCommandActivity();
        var subject = runner(new(), new(), activity);
        var context = new ConsoleSubmissionContext("action", 4, "user", 11, 22);
        var result = await subject.run(new("console", "Serversay test", "NumpadSubtract", KeyboardLayoutId: "00000409"), KeyboardLayoutCatalogTests.game, () => { }, () => {
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
        var result = await subject.run(new("console", "Serversay test", "NumpadSubtract", KeyboardLayoutId: "00000409"), KeyboardLayoutCatalogTests.game, () => { }, () => { },
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
        var result = await subject.run(new("console", "Adminsay test", "NumpadSubtract", KeyboardLayoutId: "00000409"), KeyboardLayoutCatalogTests.game, () => { }, () => submitted = true, TestContext.Current.CancellationToken);
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
        var result = await subject.run(new("console", "Adminsay test", "NumpadSubtract", KeyboardLayoutId: "00000409"), KeyboardLayoutCatalogTests.game, () => { }, stop.Cancel, stop.Token);
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

    private static ConsoleCommandRunner runner(FakeKeyboardInputApi native, FakeClipboard clipboard, ConsoleCommandActivity? activity = null)
    {
        var keyboard = new KeyboardInput(native);
        var options = new FixedOptions();
        return new(keyboard, new(clipboard), new(new ListPlayersTextNormalizer()), activity ?? new(), options,
            new(new FakeKeyboardLayoutApi(), new(), keyboard, options));
    }

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
        public Action? onRead;
        private uint sequence = 1;
        public void external(string text) { Text = text; sequence++; }
        public uint GetSequenceNumber() => sequence;
        public Task<ClipboardTextResult> ReadTextAsync(CancellationToken token) { onRead?.Invoke(); return Task.FromResult(ClipboardTextResult.TextValue(Text)); }
        public Task<OperationResult> SetTextAsync(string text, CancellationToken token, uint? expectedSequence = null)
        {
            if (FailWrite) return Task.FromResult(OperationResult.Failure("FAIL", "Write failed"));
            if (expectedSequence is { } expected && sequence != expected) return Task.FromResult(OperationResult.Failure("CLIPBOARD_CHANGED", "Changed"));
            external(text);
            return Task.FromResult(OperationResult.Success());
        }
    }
}
