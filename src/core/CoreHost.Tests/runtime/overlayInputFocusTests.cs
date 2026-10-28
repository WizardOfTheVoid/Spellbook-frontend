using System.Net;
using CoreHost.Actions;
using CoreHost.Execution;
using CoreHost.Window;
using Microsoft.Extensions.DependencyInjection;

namespace CoreHost.Tests.Runtime;

public sealed class OverlayInputFocusTests
{
    private static readonly object app = new { processId = 11, windowHandle = "0x1" };

    [Fact]
    public async Task focusBlocksOrdinaryWorkUntilANewerFalseAndDoesNotChangePhysicalGates()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registered = await host.send("POST", "/v3/runtime/app", app);
        host.native.foreground = 1;
        var runtime = host.services.GetRequiredService<GameActionRuntime>();
        using var focused = await update(host, 1, true);
        Assert.Equal(HttpStatusCode.OK, focused.StatusCode);
        foreach (var priority in new[] { "low", "normal" })
            Assert.Equal("TEXT_INPUT_ACTIVE", runtime.canExecuteCommand(priority).Reason);
        Assert.True(runtime.canExecuteCommand("high").Allowed);
        using var duplicate = await update(host, 1, false);
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        Assert.False(runtime.canExecuteCommand().Allowed);
        using var blurred = await update(host, 3, false);
        Assert.Equal(HttpStatusCode.OK, blurred.StatusCode);
        using var stale = await update(host, 2, true);
        Assert.Equal(HttpStatusCode.OK, stale.StatusCode);
        Assert.True(runtime.canExecuteCommand().Allowed);
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task queuedOrdinaryWorkWaitsWhileHighRunsAndResumesOnBlur()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registered = await host.send("POST", "/v3/runtime/app", app);
        host.native.foreground = 1;
        using var focused = await update(host, 1, true);
        Assert.Equal(HttpStatusCode.OK, focused.StatusCode);
        var ordinary = RuntimeEndpointHost.action(new CoreCommand("keys", Presses: [new(65, 0)]));
        var pending = host.send("POST", "/v3/actions", ordinary);
        var high = RuntimeEndpointHost.action(new CoreCommand("keys", Presses: [new(66, 0)])) with { Priority = "high" };
        using var completedHigh = await host.send("POST", "/v3/actions", high);
        Assert.Equal(HttpStatusCode.OK, completedHigh.StatusCode);
        Assert.False(pending.IsCompleted);
        Assert.DoesNotContain(host.input.events, input => input.VirtualKey == 65);
        Assert.Equal(new IntPtr(1), host.native.foreground);
        using var blurred = await update(host, 2, false);
        using var completedOrdinary = await pending.WaitAsync(TimeSpan.FromSeconds(3), TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, completedOrdinary.StatusCode);
        Assert.Contains(host.input.events, input => input.VirtualKey == 65);
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(-1, true)]
    [InlineData(9007199254740992, true)]
    [InlineData(2, null)]
    public async Task invalidUpdatesCannotClearFocusedInput(long sequence, bool? inputFocused)
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registered = await host.send("POST", "/v3/runtime/app", app);
        host.native.foreground = 1;
        using var focused = await update(host, 1, true);
        Assert.Equal(HttpStatusCode.OK, focused.StatusCode);
        using var rejected = await update(host, sequence, inputFocused);
        Assert.Equal(HttpStatusCode.BadRequest, rejected.StatusCode);
        Assert.Equal("TEXT_INPUT_ACTIVE", host.services.GetRequiredService<GameActionRuntime>().canExecuteCommand().Reason);
    }

    [Fact]
    public async Task authenticationAndCurrentOwnerAreRequired()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registered = await host.send("POST", "/v3/runtime/app", app);
        using var denied = await host.send("POST", "/v3/runtime/app/input-focus", new { app, sequence = 1, inputFocused = true }, auth: null);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var wrongOwner = await host.send("POST", "/v3/runtime/app/input-focus", new { app = new { processId = 22, windowHandle = "0x2" }, sequence = 1, inputFocused = true });
        Assert.Equal(HttpStatusCode.BadRequest, wrongOwner.StatusCode);
        Assert.True(host.services.GetRequiredService<GameActionRuntime>().canExecuteCommand().Allowed);
    }

    [Fact]
    public async Task replacingTheRegisteredAppDoesNotInheritFocusOrAcceptOldOwnerUpdates()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registered = await host.send("POST", "/v3/runtime/app", app);
        using var focused = await update(host, 1, true);
        Assert.Equal(HttpStatusCode.OK, focused.StatusCode);
        var windows = host.services.GetRequiredService<GameWindows>();
        Assert.True(windows.hasFocusedInput);
        using var replacement = await host.send("POST", "/v3/runtime/app", new { processId = 22, windowHandle = "0x2" });
        Assert.Equal(HttpStatusCode.OK, replacement.StatusCode);
        Assert.False(windows.hasFocusedInput);
        using var staleOwner = await update(host, 2, true);
        Assert.Equal(HttpStatusCode.BadRequest, staleOwner.StatusCode);
        Assert.False(windows.hasFocusedInput);
    }

    private static Task<HttpResponseMessage> update(RuntimeEndpointHost host, long sequence, bool? inputFocused) =>
        host.send("POST", "/v3/runtime/app/input-focus", new { app, sequence, inputFocused });
}
