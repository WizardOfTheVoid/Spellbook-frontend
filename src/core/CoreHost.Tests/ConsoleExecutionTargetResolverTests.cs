using System.Text.Json;
using CoreHost.Models;
using CoreHost.Services;
using CoreHost.Tests.Fakes;

namespace CoreHost.Tests;

public sealed class ConsoleExecutionTargetResolverTests
{
    private static readonly ValidatedRestoreTarget GameTarget = new(55, new IntPtr(0x5678));

    [Fact]
    public void ResolveBackgroundUsesConfiguredOwnedGameTargetAndIgnoresCallerTarget()
    {
        var locator = new FakeGameProcessTargetLocator(FoundGame());
        var resolver = CreateResolver(locator);

        var result = resolver.Resolve(TargetJson(99, 0x9999), background: true);

        Assert.True(result.Ok);
        Assert.Equal(GameTarget, result.Target);
        Assert.Equal(1, locator.Calls);
    }

    [Fact]
    public void ResolveBackgroundRejectsAHiddenGameWindowBeforeEnqueue()
    {
        var locator = new FakeGameProcessTargetLocator(FoundGame());
        var windowApi = WindowApi();
        windowApi.WindowVisible = false;
        var resolver = new ConsoleExecutionTargetResolver(
            locator,
            new RestoreTargetValidator(windowApi));

        var result = resolver.Resolve(null, background: true);

        Assert.False(result.Ok);
        Assert.Equal("RESTORE_TARGET_INACTIVE", result.ErrorCode);
        Assert.Null(result.Target);
    }

    [Fact]
    public void ResolveBackgroundRejectsAGameWindowOwnedByAnotherProcess()
    {
        var locator = new FakeGameProcessTargetLocator(FoundGame());
        var windowApi = WindowApi();
        windowApi.OwnerProcessId = unchecked((uint)GameTarget.ProcessId + 1);
        var resolver = new ConsoleExecutionTargetResolver(
            locator,
            new RestoreTargetValidator(windowApi));

        var result = resolver.Resolve(null, background: true);

        Assert.False(result.Ok);
        Assert.Equal("INVALID_RESTORE_TARGET", result.ErrorCode);
        Assert.Null(result.Target);
    }

    [Fact]
    public void ResolveGameTargetReusesTheBackgroundLeaseWithoutAnotherLookup()
    {
        var locator = new FakeGameProcessTargetLocator(FoundGame());
        var resolver = CreateResolver(locator);
        var leaseTarget = Assert.IsType<ValidatedRestoreTarget>(
            resolver.Resolve(null, background: true).Target);

        var result = resolver.ResolveGameTarget(leaseTarget, background: true);

        Assert.True(result.Ok);
        Assert.Equal(GameTarget, result.Target);
        Assert.Equal(1, locator.Calls);
    }

    [Fact]
    public void ResolveGameTargetLooksUpTheConfiguredGameForInteractiveInput()
    {
        var locator = new FakeGameProcessTargetLocator(FoundGame());
        var resolver = CreateResolver(locator);

        var result = resolver.ResolveGameTarget(
            new ValidatedRestoreTarget(42, new IntPtr(0x1234)),
            background: false);

        Assert.True(result.Ok);
        Assert.Equal(GameTarget, result.Target);
        Assert.Equal(1, locator.Calls);
    }

    private static ConsoleExecutionTargetResolver CreateResolver(
        IGameProcessTargetLocator locator)
    {
        return new ConsoleExecutionTargetResolver(
            locator,
            new RestoreTargetValidator(WindowApi()));
    }

    private static FakeWindowApi WindowApi()
    {
        return new FakeWindowApi
        {
            OwnerProcessId = unchecked((uint)GameTarget.ProcessId),
            ForegroundWindowHandle = GameTarget.WindowHandle
        };
    }

    private static GameProcessLookupResult FoundGame()
    {
        var process = new GameProcessInfo(
            GameTarget.WindowHandle,
            GameTarget.ProcessId,
            "Chivalry2-Win64-Shipping.exe",
            null,
            true,
            "0x0000000000005678",
            "Chivalry 2",
            null);
        return GameProcessLookupResult.Found(process, [process]);
    }

    private static JsonElement TargetJson(int processId, long windowHandle)
    {
        return JsonSerializer.SerializeToElement(new
        {
            processId,
            windowHandle = $"0x{windowHandle:X16}"
        });
    }

    private sealed class FakeGameProcessTargetLocator(GameProcessLookupResult result)
        : IGameProcessTargetLocator
    {
        public int Calls { get; private set; }

        public GameProcessLookupResult GetTargetProcess()
        {
            Calls++;
            return result;
        }
    }
}
