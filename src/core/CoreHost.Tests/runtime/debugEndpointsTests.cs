using System.Net;
using CoreHost.Actions;
using CoreHost.Debug;
using CoreHost.Input;
using CoreHost.Options;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests.Runtime;

public sealed class DebugEndpointsTests
{
    [Fact]
    public async Task cancellationAcknowledgesAdmissionAndRejectsALaterPostWithoutInput()
    {
        await using var host = await RuntimeEndpointHost.start();
        var action = RuntimeEndpointHost.action(new CoreCommand("keys", Presses: [new(78, 10)]));
        using var cancelled = await host.send("POST", "/v3/debug/queue", new { operation = "cancel", id = action.Id });
        using var acknowledgement = await RuntimeEndpointHost.json(cancelled);
        Assert.False(acknowledgement.RootElement.GetProperty("data").GetProperty("found").GetBoolean());
        using var response = await host.send("POST", "/v3/actions", action);
        using var result = await RuntimeEndpointHost.json(response);
        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        Assert.Equal("ACTION_CANCELLED", result.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal(0, result.RootElement.GetProperty("data").GetProperty("sentCommands").GetInt32());
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task consoleTransitionsReportSubmissionBeforeOutputAndCleanup()
    {
        await using var host = await RuntimeEndpointHost.start();
        host.copied.output = "fixture output";
        var action = RuntimeEndpointHost.action(new CoreCommand("console", "fixture-command", "NumpadSubtract", DelayMs: 1, ExpectClipboard: true));
        using var response = await host.send("POST", "/v3/actions", action);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var events = host.services.GetRequiredService<DebugJournal>().read(0).Events;
        var phases = events.Where(item => item.Kind == "phase").Select(item => item.Message).ToArray();
        Assert.Contains("delay", phases);
        Assert.Contains("focus_game", phases);
        Assert.Contains("console_open", phases);
        Assert.Contains("clipboard_wait", phases);
        Assert.Contains("clipboard_restore", phases);
        var submitted = Assert.Single(events, item => item.Kind == "command_submitted");
        Assert.True(submitted.Sequence < events.Single(item => item.Kind == "phase" && item.Message == "clipboard_wait").Sequence);
        Assert.True(submitted.Sequence < events.Single(item => item.Kind == "completed").Sequence);
        Assert.Equal(0, submitted.CommandIndex);
        Assert.Equal(action.Id, submitted.ActionId);
        Assert.Equal("idle", host.services.GetRequiredService<DebugJournal>().execution.Phase);
    }

    [Theory]
    [InlineData("GET", "/v3/debug")]
    [InlineData("POST", "/v3/debug/session")]
    [InlineData("POST", "/v3/debug/queue")]
    [InlineData("PATCH", "/v3/debug/settings")]
    public async Task debugEndpointsRequireTheExistingToken(string method, string path)
    {
        await using var host = await RuntimeEndpointHost.start();
        using var response = await host.send(method, path, auth: null);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task snapshotIncludesFullQueueActualSettingsAndOrdinaryGateWithoutSendingInput()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var registration = await host.send("POST", "/v3/runtime/app", new AppTarget(11, "0x1"));
        using var pause = await host.send("POST", "/v3/debug/queue", new { operation = "pause" });
        Assert.Equal(HttpStatusCode.OK, pause.StatusCode);
        host.services.GetRequiredService<InputActivityTracker>().key(65, true, false);
        var action = RuntimeEndpointHost.action(new("console", "ListPlayers", "NumpadSubtract"), new("keys", Presses: [new(78, 100)])) with { Priority = "high" };
        _ = host.services.GetRequiredService<ActionQueue>().enqueue(action, Environment.TickCount64, 10000, 10, TestContext.Current.CancellationToken);
        using var response = await host.send("GET", "/v3/debug?after=0");
        using var json = await RuntimeEndpointHost.json(response);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = json.RootElement.GetProperty("data");
        Assert.True(data.GetProperty("status").GetProperty("execution").GetProperty("canExecuteCommand").GetBoolean());
        Assert.False(data.GetProperty("ordinaryGate").GetProperty("canExecuteCommand").GetBoolean());
        Assert.Equal("KEYBOARD_ACTIVE", data.GetProperty("ordinaryGate").GetProperty("reason").GetString());
        Assert.True(data.GetProperty("queue").GetProperty("paused").GetBoolean());
        var queued = data.GetProperty("queue").GetProperty("actions")[0];
        Assert.Equal(action.Id, queued.GetProperty("id").GetString());
        Assert.Equal(2, queued.GetProperty("commands").GetArrayLength());
        Assert.Equal(65, data.GetProperty("input").GetProperty("heldKeys")[0].GetInt32());
        Assert.True(data.GetProperty("windows").GetProperty("game").GetProperty("ready").GetBoolean());
        Assert.Equal(0, data.GetProperty("settings").GetProperty("QUEUE_GATE_NORMAL").GetInt32());
        Assert.False(data.GetProperty("settings").TryGetProperty("Core__AuthToken", out _));
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task priorityGatesUseExactEnvironmentNamesAndCanBeChangedIndependently()
    {
        await using var host = await RuntimeEndpointHost.start(configuration: new Dictionary<string, string?>
        {
            ["QUEUE_GATE_NORMAL"] = "1200", ["QUEUE_GATE_LOW"] = "2300", ["QUEUE_GATE_HIGH"] = "0"
        });
        using var initial = await host.send("GET", "/v3/debug");
        using var initialJson = await RuntimeEndpointHost.json(initial);
        var settings = initialJson.RootElement.GetProperty("data").GetProperty("settings");
        Assert.Equal(1200, settings.GetProperty("QUEUE_GATE_NORMAL").GetInt32());
        Assert.Equal(2300, settings.GetProperty("QUEUE_GATE_LOW").GetInt32());
        Assert.Equal(0, settings.GetProperty("QUEUE_GATE_HIGH").GetInt32());
        using var changed = await host.send("PATCH", "/v3/debug/settings", new
        {
            values = new Dictionary<string, double> { ["QUEUE_GATE_LOW"] = 3400, ["QUEUE_GATE_HIGH"] = 50 }
        });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        using var updated = await host.send("GET", "/v3/debug");
        using var updatedJson = await RuntimeEndpointHost.json(updated);
        settings = updatedJson.RootElement.GetProperty("data").GetProperty("settings");
        Assert.Equal(1200, settings.GetProperty("QUEUE_GATE_NORMAL").GetInt32());
        Assert.Equal(3400, settings.GetProperty("QUEUE_GATE_LOW").GetInt32());
        Assert.Equal(50, settings.GetProperty("QUEUE_GATE_HIGH").GetInt32());
    }

    [Fact]
    public async Task patchesAffectTheOptionsConsumedByExecutionAndResetRestoresSavedValues()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var changed = await host.send("PATCH", "/v3/debug/settings", new { values = new Dictionary<string, double> { ["QUEUE_GATE_NORMAL"] = 150 } });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(150, host.services.GetRequiredService<IOptionsMonitor<CoreHostOptions>>().CurrentValue.QueueGateNormal);
        using var invalid = await host.send("PATCH", "/v3/debug/settings", new { values = new Dictionary<string, double> { ["Core__Port"] = 123 } });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);
        using var reset = await host.send("PATCH", "/v3/debug/settings", new { reset = true });
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);
        Assert.Equal(0, host.services.GetRequiredService<IOptionsMonitor<CoreHostOptions>>().CurrentValue.QueueGateNormal);
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task armingReturnsSequenceAndOnlyFreshPhysicalShortcutsArePolled()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var armed = await host.send("POST", "/v3/debug/session", new { enabled = true });
        using var armJson = await RuntimeEndpointHost.json(armed);
        var start = armJson.RootElement.GetProperty("data");
        Assert.True(start.GetProperty("armed").GetBoolean());
        var after = start.GetProperty("sequence").GetInt64();
        var input = host.services.GetRequiredService<InputActivityTracker>();
        input.physicalKey(0x61, 0x4F, true, false, false);
        input.physicalKey(0x61, 0x4F, true, false, false);
        input.physicalKey(0x62, 0x50, true, true, false);
        using var response = await host.send("GET", $"/v3/debug?after={after}");
        using var json = await RuntimeEndpointHost.json(response);
        var events = json.RootElement.GetProperty("data").GetProperty("events").EnumerateArray().ToArray();
        var shortcut = Assert.Single(events, item => item.GetProperty("kind").GetString() == "shortcut");
        Assert.Equal(1, shortcut.GetProperty("slot").GetInt32());
        Assert.Empty(host.input.events);
    }
}
