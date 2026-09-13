using System.Net;
using CoreHost.Actions;
using Microsoft.Extensions.DependencyInjection;

namespace CoreHost.Tests.Runtime;

public sealed class ActionEndpointsTests
{
    [Theory]
    [InlineData("user", 30000)]
    [InlineData("system", 10000)]
    [InlineData("user", 45000, true)]
    [InlineData("system", 15000, true)]
    public async Task authorDeterminesLifetimeFromEnqueue(string author, int lifetimeMs, bool configured = false)
    {
        await using var host = await RuntimeEndpointHost.start(configuration: configured ? new Dictionary<string, string?>
            { ["Queue:UserActionTtlMs"] = "45000", ["Queue:SystemActionTtlMs"] = "15000" } : null);
        var queue = host.services.GetRequiredService<ActionQueue>();
        queue.control("pause");
        var action = RuntimeEndpointHost.action(new CoreCommand("console", "Serversay hello", "NumpadSubtract")) with { Author = author };
        var before = Environment.TickCount64;
        var pending = host.send("POST", "/v3/actions", action);
        var timeout = before + 5000;
        while (queue.currentAction is null && Environment.TickCount64 < timeout)
            await Task.Delay(10, TestContext.Current.CancellationToken);
        var after = Environment.TickCount64;
        Assert.Equal(action.Id, queue.currentAction?.Id);
        var queued = queue.debugSnapshot(after).Actions.Single();
        Assert.InRange(queued.RemainingMs, lifetimeMs - (after - before), lifetimeMs);
        Assert.Null(queue.take(after + lifetimeMs, _ => true));
        using var response = await pending;
        using var json = await RuntimeEndpointHost.json(response);
        Assert.Equal("ACTION_EXPIRED", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Empty(host.input.events);
    }

    [Theory]
    [InlineData("GET", "/v3/status")]
    [InlineData("POST", "/v3/actions")]
    [InlineData("POST", "/v3/runtime/app")]
    public async Task v3RoutesRequireTokenBeforeDispatch(string method, string path)
    {
        await using var host = await RuntimeEndpointHost.start();
        foreach (var token in new string?[] { null, "wrong-token" })
        {
            using var response = await host.send(method, path, auth: token);
            using var json = await RuntimeEndpointHost.json(response);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
            Assert.False(json.RootElement.GetProperty("ok").GetBoolean());
            Assert.Equal("UNAUTHORIZED", json.RootElement.GetProperty("error").GetProperty("code").GetString());
            Assert.False(json.RootElement.TryGetProperty("data", out _));
        }
        Assert.Empty(host.input.events);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("UnsupportedKey")]
    public async Task consoleCommandsRequireExplicitSupportedKey(string? consoleKey)
    {
        await using var host = await RuntimeEndpointHost.start();
        var action = RuntimeEndpointHost.action(new CoreCommand("console", "Serversay hello", consoleKey));

        using var response = await host.send("POST", "/v3/actions", action);
        using var json = await RuntimeEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(action.Id, json.RootElement.GetProperty("requestId").GetString());
        Assert.Equal("INVALID_ACTION", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task actionRejectsAWindowOwnedByAnotherProcess()
    {
        await using var host = await RuntimeEndpointHost.start();
        var action = RuntimeEndpointHost.action(new CoreCommand("console", "Serversay hello", "NumpadSubtract")) with { App = new(22, "0x1") };

        using var response = await host.send("POST", "/v3/actions", action);
        using var json = await RuntimeEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("INVALID_APP_TARGET", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task productionWorkerCompletesConsoleAndKeyCommandsAndRestoresApp()
    {
        await using var host = await RuntimeEndpointHost.start();
        host.native.foreground = 1;
        var action = RuntimeEndpointHost.action(new("console", "Serversay hello", "NumpadSubtract"),
            new("keys", Presses: [new(65, 0)]));

        using var response = await host.send("POST", "/v3/actions", action);
        using var json = await RuntimeEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(action.Id, json.RootElement.GetProperty("requestId").GetString());
        var data = json.RootElement.GetProperty("data");
        Assert.Equal("completed", data.GetProperty("status").GetString());
        Assert.True(data.GetProperty("sent").GetBoolean());
        Assert.Equal(2, data.GetProperty("sentCommands").GetInt32());
        Assert.Equal(2, data.GetProperty("commandResults").GetArrayLength());
        Assert.All(data.GetProperty("commandResults").EnumerateArray(), result => Assert.True(result.GetProperty("sent").GetBoolean()));
        Assert.Contains(host.input.events, input => input.VirtualKey == 65 && (input.Flags & 2) == 0);
        Assert.Equal(new IntPtr(1), host.native.foreground);
        Assert.Equal("original clipboard", host.copied.text);
    }

    [Fact]
    public async Task listPlayersOutputRemainsAtTopLevelForAppIngestion()
    {
        await using var host = await RuntimeEndpointHost.start();
        host.copied.output = "ServerName - Test Server 127.0.0.1:10010\nName - PlayFabPlayerId - EOSPlayerId - Score - Kills - Deaths - Ping\nPlayer One - 19CBAB2A3A16E567 - ABCDEF1234567890 - 250 - 5 - 2 - 44 ms";
        var action = RuntimeEndpointHost.action(new CoreCommand("console", "ListPlayers", "NumpadSubtract"));

        using var response = await host.send("POST", "/v3/actions", action);
        using var json = await RuntimeEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = json.RootElement.GetProperty("data");
        Assert.Equal("Test Server", data.GetProperty("serverName").GetString());
        Assert.Equal("19CBAB2A3A16E567", data.GetProperty("players")[0].GetProperty("playfabId").GetString());
        Assert.Equal("completed", data.GetProperty("status").GetString());
        Assert.Equal(1, data.GetProperty("sentCommands").GetInt32());
        Assert.Equal("Test Server", data.GetProperty("commandResults")[0].GetProperty("data").GetProperty("serverName").GetString());
        Assert.Equal("original clipboard", host.copied.text);
    }
}
