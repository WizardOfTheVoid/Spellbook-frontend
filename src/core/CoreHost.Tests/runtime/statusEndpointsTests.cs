using System.Net;
using CoreHost.Actions;
using CoreHost.Input;
using Microsoft.Extensions.DependencyInjection;

namespace CoreHost.Tests.Runtime;

public sealed class StatusEndpointsTests
{
    [Theory]
    [InlineData(true, 2, true)]
    [InlineData(true, 1, false)]
    [InlineData(true, 3, false)]
    [InlineData(false, 2, false)]
    public async Task chatOnlyStartsInTheRunningFocusedGame(bool running, int foreground, bool expected)
    {
        await using var host = await RuntimeEndpointHost.start(running);
        host.native.foreground = foreground;
        var tracker = host.services.GetRequiredService<InputActivityTracker>();
        foreach (var key in new[] { 0x59, 0x55, 0x0D })
        {
            tracker.key(key, true, false);
            tracker.key(key, false, false);
        }
        using var response = await host.send("GET", "/v3/status");
        using var json = await RuntimeEndpointHost.json(response);
        Assert.Equal(expected, json.RootElement.GetProperty("data").GetProperty("input").GetProperty("isChatting").GetBoolean());
        host.native.foreground = 2;
        Assert.Equal(expected, tracker.snapshot(0).IsChatting);
    }

    [Theory]
    [InlineData(true, 1)]
    [InlineData(true, 3)]
    [InlineData(false, 2)]
    public async Task gameInputStatusIsInactiveOutsideTheGameWhileSafetyTrackingContinues(bool running, int foreground)
    {
        await using var host = await RuntimeEndpointHost.start(running);
        using var registration = await host.send("POST", "/v3/runtime/app", new AppTarget(11, "0x1"));
        host.native.foreground = foreground;
        var tracker = host.services.GetRequiredService<InputActivityTracker>();
        tracker.key(13, true, false);
        tracker.mouse(1, true, false);
        using var response = await host.send("GET", "/v3/status");
        using var json = await RuntimeEndpointHost.json(response);
        var data = json.RootElement.GetProperty("data");
        var input = data.GetProperty("input");
        foreach (var field in new[] { "available", "keyboardActive", "mouseActive", "isChatting" })
            Assert.False(input.GetProperty(field).GetBoolean());
        Assert.Equal(0, input.GetProperty("idleMs").GetInt64());
        Assert.Equal(0, input.GetProperty("chatCooldownRemainingMs").GetInt64());
        Assert.False(input.TryGetProperty("timeSinceChattingMs", out _));
        Assert.False(data.GetProperty("execution").GetProperty("canExecuteCommand").GetBoolean());
        Assert.True(tracker.snapshot(0).KeyboardActive);
        Assert.True(tracker.snapshot(0).MouseActive);
        using var legacy = await host.send("GET", "/v2/meta/get");
        using var legacyJson = await RuntimeEndpointHost.json(legacy);
        Assert.False(legacyJson.RootElement.GetProperty("data").GetProperty("movement").GetProperty("isMoving").GetBoolean());
    }

    [Fact]
    public async Task leavingGameHidesChatWhileExistingGameCooldownKeepsCountingDown()
    {
        await using var host = await RuntimeEndpointHost.start();
        var tracker = host.services.GetRequiredService<InputActivityTracker>();
        tracker.key(13, true, false);
        tracker.key(13, false, false);
        Assert.True(tracker.snapshot(0).IsChatting);
        host.native.foreground = 3;
        Assert.False(tracker.snapshot(0).IsChatting);
        Assert.Equal(0, tracker.snapshot(0).ChatCooldownRemainingMs);
        host.native.foreground = 2;
        Assert.True(tracker.snapshot(0).IsChatting);
    }

    [Fact]
    public async Task statusRetainsLastThreeCommandsIncludingRepeatedCommands()
    {
        await using var host = await RuntimeEndpointHost.start();
        var activity = host.services.GetRequiredService<CoreHost.Services.ConsoleCommandActivity>();
        foreach (var command in new[] { "old", "ListPlayers", "ListPlayers", "Serversay hello" })
            activity.Record(command);

        using var response = await host.send("GET", "/v3/status");
        using var json = await RuntimeEndpointHost.json(response);
        var commands = json.RootElement.GetProperty("data").GetProperty("recentCommands").EnumerateArray().ToArray();
        Assert.Equal(new[] { "Serversay hello", "ListPlayers", "ListPlayers" },
            commands.Select(command => command.GetProperty("command").GetString()));
        Assert.All(commands, command => Assert.True(command.GetProperty("timeSinceMs").GetInt64() >= 0));
    }

    [Theory]
    [InlineData("high", true, null)]
    [InlineData("normal", false, "MINIMUM_IDLE_NOT_REACHED")]
    public async Task statusUsesCurrentActionPriorityAndIdleRequirement(string priority, bool allowed, string? reason)
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registration = await host.send("POST", "/v3/runtime/app", new AppTarget(11, "0x1"));
        if (priority == "high") host.services.GetRequiredService<InputActivityTracker>().key(65, true, false);
        var action = RuntimeEndpointHost.action(new CoreCommand("keys", DelayMs: 5000,
            Presses: [new(87, 10)], MinimumIdleMs: 90000)) with { Priority = priority };
        var pending = host.services.GetRequiredService<ActionQueue>().enqueue(action, Environment.TickCount64,
            10000, 999, TestContext.Current.CancellationToken);

        using var response = await host.send("GET", "/v3/status");
        using var json = await RuntimeEndpointHost.json(response);
        var execution = json.RootElement.GetProperty("data").GetProperty("execution");
        Assert.Equal(allowed, execution.GetProperty("canExecuteCommand").GetBoolean());
        if (reason is null) Assert.False(execution.TryGetProperty("reason", out _));
        else Assert.Equal(reason, execution.GetProperty("reason").GetString());
        Assert.False(pending.IsCompleted);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task statusSerializesUnregisteredAndIdleStateWithoutOptionalFields(bool gameRunning)
    {
        await using var host = await RuntimeEndpointHost.start(gameRunning);

        using var response = await host.send("GET", "/v3/status");
        using var json = await RuntimeEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.False(json.RootElement.TryGetProperty("requestId", out _));
        Assert.False(json.RootElement.TryGetProperty("error", out _));
        var data = json.RootElement.GetProperty("data");
        Assert.False(data.GetProperty("runtime").GetProperty("enabled").GetBoolean());
        Assert.Equal(gameRunning, data.GetProperty("runtime").GetProperty("gameRunning").GetBoolean());
        Assert.False(data.GetProperty("runtime").GetProperty("appRunning").GetBoolean());
        Assert.Equal(gameRunning, data.GetProperty("focus").GetProperty("gameReady").GetBoolean());
        Assert.Equal("unknown", data.GetProperty("focus").GetProperty("overlayState").GetString());
        Assert.Equal(!gameRunning, data.GetProperty("focus").TryGetProperty("reason", out _));
        Assert.False(data.GetProperty("execution").GetProperty("canExecuteCommand").GetBoolean());
        Assert.Equal("PROCESS_NOT_RUNNING", data.GetProperty("execution").GetProperty("reason").GetString());
        Assert.Equal(gameRunning, data.GetProperty("input").GetProperty("available").GetBoolean());
        Assert.False(data.GetProperty("input").TryGetProperty("timeSinceChattingMs", out _));
        Assert.False(data.TryGetProperty("lastCommand", out _));
        var queue = data.GetProperty("queue");
        Assert.Equal("idle", queue.GetProperty("state").GetString());
        Assert.Equal(0, queue.GetProperty("pendingActions").GetInt32());
        foreach (var field in new[] { "id", "author", "priority", "remainingMs", "reason", "lastResult" })
            Assert.False(queue.TryGetProperty(field, out _));
    }

    [Fact]
    public async Task appRegistrationEnablesExecutionAndCompletedCommandAppearsInStatus()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registration = await host.send("POST", "/v3/runtime/app", new AppTarget(11, "0x1"));
        Assert.Equal(HttpStatusCode.OK, registration.StatusCode);
        using var registeredStatus = await host.send("GET", "/v3/status");
        using var registeredJson = await RuntimeEndpointHost.json(registeredStatus);
        Assert.True(registeredJson.RootElement.GetProperty("data").GetProperty("runtime").GetProperty("enabled").GetBoolean());
        Assert.True(registeredJson.RootElement.GetProperty("data").GetProperty("execution").GetProperty("canExecuteCommand").GetBoolean());
        var action = RuntimeEndpointHost.action(new CoreCommand("console", "Serversay hello", "NumpadSubtract"));
        using var completed = await host.send("POST", "/v3/actions", action);
        Assert.Equal(HttpStatusCode.OK, completed.StatusCode);

        using var response = await host.send("GET", "/v3/status");
        using var json = await RuntimeEndpointHost.json(response);

        var data = json.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("runtime").GetProperty("enabled").GetBoolean());
        Assert.True(data.GetProperty("execution").GetProperty("canExecuteCommand").GetBoolean());
        Assert.False(data.GetProperty("execution").TryGetProperty("reason", out _));
        Assert.Equal("Serversay hello", data.GetProperty("lastCommand").GetProperty("command").GetString());
        Assert.True(data.GetProperty("lastCommand").GetProperty("timeSinceMs").GetInt64() >= 0);
        var result = data.GetProperty("queue").GetProperty("lastResult");
        Assert.Equal(action.Id, result.GetProperty("id").GetString());
        Assert.Equal("completed", result.GetProperty("status").GetString());
        Assert.Equal(1, result.GetProperty("sentCommands").GetInt32());
        Assert.False(result.TryGetProperty("errorCode", out _));
    }
}
