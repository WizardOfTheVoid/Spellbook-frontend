using System.Net;
using CoreHost.Actions;
using CoreHost.Tests.Runtime;

namespace CoreHost.Tests.KeyboardLayouts;

public sealed class KeyboardLayoutEndpointsTests
{
    [Fact]
    public async Task catalogWithoutGameIsAuthenticatedAndDoesNotInjectInput()
    {
        await using var host = await RuntimeEndpointHost.start(gameRunning: false);
        using var denied = await host.send("GET", "/v3/keyboard-layouts", auth: null);
        Assert.Equal(HttpStatusCode.Unauthorized, denied.StatusCode);
        using var response = await host.send("GET", "/v3/keyboard-layouts");
        using var json = await RuntimeEndpointHost.json(response);
        var data = json.RootElement.GetProperty("data");
        Assert.Equal(1, data.GetProperty("capabilityVersion").GetInt32());
        Assert.False(data.TryGetProperty("gameLayoutId", out _));
        Assert.Equal(3, data.GetProperty("installed").GetArrayLength());
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task missingLayoutIsRejectedBeforeQueueOrKeyboardInput()
    {
        await using var host = await RuntimeEndpointHost.start();
        var request = RuntimeEndpointHost.action(new CoreCommand("console", "ListPlayers", "Minus")) with {
            Commands = [new("console", "ListPlayers", "Minus")]
        };
        using var response = await host.send("POST", "/v3/actions", request);
        using var json = await RuntimeEndpointHost.json(response);
        Assert.Equal("KEYBOARD_LAYOUT_REQUIRED", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Empty(host.input.events);
    }
}
