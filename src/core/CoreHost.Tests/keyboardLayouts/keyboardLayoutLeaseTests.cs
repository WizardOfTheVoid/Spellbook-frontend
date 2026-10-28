using CoreHost.KeyboardLayouts;
using CoreHost.Input;
using CoreHost.Options;
using CoreHost.Tests.Fakes;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests.KeyboardLayouts;

public sealed class KeyboardLayoutLeaseTests
{
    [Fact]
    public async Task unresolvedLayoutCannotBeMistakenForAReplacedGame()
    {
        var api = new FakeKeyboardLayoutApi();
        var subject = service(api);
        var lease = await subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken);
        api.readFailure = new("KEYBOARD_LAYOUT_UNAVAILABLE", "Catalog unavailable");
        Assert.False((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        Assert.NotNull(subject.pendingRestoration);
    }
    internal static KeyboardLayoutService service(FakeKeyboardLayoutApi api, InputActivityTracker? input = null, FakeKeyboardInputApi? keyboard = null)
    {
        input ??= new();
        input.setAvailable(true);
        return new(api, input, new(keyboard ?? new()), new LayoutOptions(), new LayoutTestClock());
    }

    [Fact]
    public async Task sameLayoutMakesNoRequestAndAddsNoWait()
    {
        var api = new FakeKeyboardLayoutApi();
        var subject = service(api);
        var lease = await subject.acquire(KeyboardLayoutCatalogTests.game, api.current, () => { }, TestContext.Current.CancellationToken);
        Assert.False(lease.changed);
        Assert.True((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        Assert.Empty(api.requests);
    }

    [Fact]
    public async Task switchMustBeObservedBeforeInputAllowedAndRestoreIsIdempotent()
    {
        var api = new FakeKeyboardLayoutApi();
        var subject = service(api);
        var lease = await subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken);
        lease.check();
        Assert.True(lease.changed);
        Assert.Equal("00000414", api.current);
        Assert.True((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        Assert.True((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        Assert.Equal(new[] { "00000414", "00000409" }, api.requests);
    }

    [Fact]
    public async Task delayedSwitchQueuesCompensatingRestoreAndBlocksInput()
    {
        var api = new FakeKeyboardLayoutApi { apply = false };
        var subject = service(api);
        var error = await Assert.ThrowsAsync<KeyboardLayoutException>(() => subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken));
        Assert.Equal("KEYBOARD_LAYOUT_SWITCH_FAILED", error.code);
        Assert.Equal(new[] { "00000414", "00000409" }, api.requests);
        Assert.NotNull(subject.pendingRestoration);
        await Assert.ThrowsAsync<KeyboardLayoutException>(() => subject.acquire(KeyboardLayoutCatalogTests.game, "00000409", () => { }, TestContext.Current.CancellationToken));
        api.apply = true;
        Assert.True((await subject.retryRestore(() => { }, TestContext.Current.CancellationToken)).Ok);
        Assert.Null(subject.pendingRestoration);
    }

    [Fact]
    public async Task acquireFailureRestoresBeforeLeaseExists()
    {
        using var stop = new CancellationTokenSource();
        var api = new FakeKeyboardLayoutApi { onRequest = id => { if (id == "00000414") stop.Cancel(); } };
        var subject = service(api);
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, stop.Token));
        Assert.Equal("00000409", api.current);
        Assert.Null(subject.pendingRestoration);
    }

    [Fact]
    public async Task foreignLayoutSelectionIsPreserved()
    {
        var api = new FakeKeyboardLayoutApi();
        var subject = service(api);
        var lease = await subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken);
        api.current = "00000809";
        Assert.Equal("KEYBOARD_LAYOUT_CHANGED", Assert.Throws<KeyboardLayoutException>(lease.check).code);
        Assert.True((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        Assert.Equal("00000809", api.current);
        Assert.Single(api.requests);
    }

    [Fact]
    public async Task replacementGameNeverReceivesRestore()
    {
        var api = new FakeKeyboardLayoutApi();
        var subject = service(api);
        var lease = await subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken);
        api.thread++;
        Assert.True((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        Assert.Single(api.requests);
    }

    [Fact]
    public async Task heldControlsPreventNewSwitchEvenDuringCheckLock()
    {
        var api = new FakeKeyboardLayoutApi();
        var input = new InputActivityTracker();
        input.WillPerformAppRoundTrip = true;
        input.key(17, true, false);
        var subject = service(api, input);
        await Assert.ThrowsAsync<KeyboardLayoutException>(() => subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken));
        Assert.Empty(api.requests);
    }

    [Fact]
    public async Task restoreTimeoutBlocksFollowingInputAndRecoveryUsesOwnedTarget()
    {
        var api = new FakeKeyboardLayoutApi();
        var subject = service(api);
        var lease = await subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken);
        api.apply = false;
        Assert.False((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        Assert.NotNull(subject.pendingRestoration);
        api.apply = true;
        Assert.True((await subject.retryRestore(() => { }, TestContext.Current.CancellationToken)).Ok);
        Assert.Equal("00000409", api.current);
    }

    internal sealed class LayoutOptions : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue { get; } = new() { KeyboardLayouts = new() { SwitchTimeoutMs = 30, RestoreTimeoutMs = 30, PollMs = 1, InputSettleMs = 1 } };
        public CoreHostOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }

    [Fact]
    public async Task scopesCannotInterleaveAndPartialModifiersAreReleasedBeforeRestoration()
    {
        var api = new FakeKeyboardLayoutApi();
        var native = new FakeKeyboardInputApi { Sent = 1 };
        var keyboard = new KeyboardInput(native);
        var input = new InputActivityTracker();
        input.setAvailable(true);
        var subject = new KeyboardLayoutService(api, input, keyboard, new LayoutOptions(), new LayoutTestClock());
        var lease = await subject.acquire(KeyboardLayoutCatalogTests.game, "00000414", () => { }, TestContext.Current.CancellationToken);
        var next = subject.acquire(KeyboardLayoutCatalogTests.game, "00000409", () => { }, TestContext.Current.CancellationToken);
        Assert.False(next.IsCompleted);
        Assert.ThrowsAny<Exception>(keyboard.paste);
        api.onRequest = id => {
            if (id == "00000409") Assert.All(native.InputBatches.Last(), item => Assert.NotEqual(0u, item.Flags & 2));
        };
        Assert.True((await lease.restore(TestContext.Current.CancellationToken)).Ok);
        var nextLease = await next;
        Assert.True((await nextLease.restore(TestContext.Current.CancellationToken)).Ok);
    }
}
