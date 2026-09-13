using CoreHost.Actions;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Window;
using CoreHost.Win32;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests.Window;

public sealed class WindowOwnershipTests
{
    [Fact]
    public void readinessDoesNotSwitchToNewRegistrationDuringValidation()
    {
        var (native, windows) = create();
        native.Foreground = 2;
        native.OnOwner = () => windows.register(new(2, "0x2"));

        Assert.False(windows.isReady("app"));
    }

    [Fact]
    public void focusedDoesNotSwitchToNewRegistrationDuringForegroundRead()
    {
        var (native, windows) = create();
        native.Foreground = 2;
        native.OnForeground = () => windows.register(new(2, "0x2"));

        Assert.False(windows.isFocused("app"));
    }

    [Fact]
    public async Task focusRejectsRegistrationChangeBeforeNativeAttempt()
    {
        var (native, windows) = create();
        native.OnOwner = () => windows.register(new(2, "0x2"));

        var result = await windows.focus("app", TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
        Assert.Empty(native.Requests);
    }

    [Fact]
    public async Task alreadyCancelledFocusDoesNotChangeForeground()
    {
        var (native, windows) = create();
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => windows.focus("app", cancellation.Token));

        Assert.Empty(native.Requests);
        Assert.Equal(new IntPtr(3), native.Foreground);
    }

    [Fact]
    public async Task invalidTargetIsNotUnminimized()
    {
        var native = new Windows { Minimized = true };
        var service = new ForegroundWindowService(native);

        var result = await service.FocusAndVerifyAsync(1, timing(), TestContext.Current.CancellationToken, validateTarget: () => false);

        Assert.False(result.Ok);
        Assert.Equal("WINDOW_TARGET_CHANGED", result.ErrorCode);
        Assert.Empty(native.Restored);
        Assert.Empty(native.Requests);
    }

    [Fact]
    public async Task ownershipLossStopsBringAndSubsequentFocusAttempts()
    {
        var native = new Windows { AcceptFocus = false };
        native.OnRequest = () => native.Owners[1] = 9;
        var service = new ForegroundWindowService(native);

        var result = await service.FocusAndVerifyAsync(1, timing(), TestContext.Current.CancellationToken, validateTarget: () => native.Owners[1] == 1);

        Assert.False(result.Ok);
        Assert.Equal("WINDOW_TARGET_CHANGED", result.ErrorCode);
        Assert.Equal([new IntPtr(1)], native.Requests);
        Assert.Empty(native.Brought);
        Assert.Equal(0, native.Attached);
    }

    [Fact]
    public async Task userForegroundSwitchStopsBringAndSubsequentFocusAttempts()
    {
        var (native, windows) = create();
        native.AcceptFocus = false;
        native.OnRequest = () => native.Foreground = 2;

        var result = await windows.focus("app", TestContext.Current.CancellationToken);

        Assert.False(result.Ok);
        Assert.Equal("WINDOW_TARGET_CHANGED", result.ErrorCode);
        Assert.Equal([new IntPtr(1)], native.Requests);
        Assert.Empty(native.Brought);
        Assert.Equal(new IntPtr(2), native.Foreground);
        Assert.Equal(0, native.Attached);
    }

    [Fact]
    public async Task cancellationDuringRequestStopsFurtherNativeSideEffects()
    {
        var native = new Windows { AcceptFocus = false };
        using var cancellation = new CancellationTokenSource();
        native.OnRequest = cancellation.Cancel;
        var service = new ForegroundWindowService(native);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.FocusAndVerifyAsync(1, timing(), cancellation.Token));

        Assert.Single(native.Requests);
        Assert.Empty(native.Brought);
        Assert.Equal(0, native.Attached);
    }

    [Fact]
    public async Task cancelledRestoreDoesNotUnminimizeWindow()
    {
        var native = new Windows { Minimized = true };
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => new ForegroundWindowService(native).RestoreAndVerifyAsync(1, timing(), cancellation.Token));

        Assert.Empty(native.Restored);
        Assert.Empty(native.Requests);
    }

    private static WindowOptions timing() => new() { FocusTimeoutMs = 30, RestoreSettleMs = 0 };

    private static (Windows, GameWindows) create()
    {
        var native = new Windows();
        var windows = new GameWindows(new Locator(), native, new Readiness(native), new ForegroundWindowService(native), new Monitor());
        Assert.True(windows.register(new AppTarget(1, "0x1")));
        return (native, windows);
    }

    private sealed class Monitor : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue { get; } = new() { Window = new() { FocusTimeoutMs = 30, FocusSettleMs = 0, RestoreSettleMs = 0 } };
        public CoreHostOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }

    private sealed class Locator : IGameProcessTargetLocator
    {
        public GameProcessLookupResult GetTargetProcess() => GameProcessLookupResult.Failure("GAME_NOT_RUNNING", "No game in this fixture.");
    }

    private sealed class Readiness(Windows native) : IWindowReadiness
    {
        public bool isReady(IntPtr handle) => native.Foreground == handle;
    }

    private sealed class Windows : IWindowApi
    {
        internal Dictionary<IntPtr, uint> Owners { get; } = new() { [1] = 1, [2] = 2, [3] = 3 };
        internal IntPtr Foreground = 3;
        internal bool Minimized;
        internal bool AcceptFocus = true;
        internal Action? OnOwner, OnForeground, OnRequest;
        internal readonly List<IntPtr> Requests = [], Restored = [], Brought = [];
        internal int Attached;

        public IntPtr GetForegroundWindow() { var callback = OnForeground; OnForeground = null; callback?.Invoke(); return Foreground; }
        public bool SetForegroundWindow(IntPtr window) { Requests.Add(window); OnRequest?.Invoke(); if (AcceptFocus) Foreground = window; return AcceptFocus; }
        public bool BringWindowToTop(IntPtr window) { Brought.Add(window); return false; }
        public bool AttachThreadInput(uint from, uint to, bool attach) { Attached += attach ? 1 : -1; return true; }
        public bool IsIconic(IntPtr window) => Minimized;
        public bool ShowWindow(IntPtr window, int command) { Restored.Add(window); return true; }
        public bool IsWindow(IntPtr window) => Owners.ContainsKey(window);
        public bool IsWindowVisible(IntPtr window) => true;
        public uint GetCurrentThreadId() => 10;
        public uint GetWindowThreadProcessId(IntPtr window, out uint owner)
        {
            var callback = OnOwner;
            OnOwner = null;
            callback?.Invoke();
            owner = Owners.GetValueOrDefault(window);
            return owner;
        }
    }
}
