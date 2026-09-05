using System.Text.Json;
using CoreHost.Models;
using CoreHost.Services;
using CoreHost.Tests.Fakes;

namespace CoreHost.Tests;

public sealed class GameInputActivityGateTests
{
    private static readonly IntPtr GameWindow = new(42);

    [Fact]
    public void VisibleExecutionDoesNotInspectGameActivity()
    {
        var locator = new FakeGameLocator(GameProcessLookupResult.Failure("GAME_NOT_RUNNING", "Missing"));
        var gate = CreateGate(locator, available: false, foreground: IntPtr.Zero);

        Assert.Null(gate.Check("request-1", requireIdle: false));
        Assert.Equal(0, locator.Calls);
    }

    [Theory]
    [InlineData(false, true, false, "MOVEMENT_MONITOR_UNAVAILABLE")]
    [InlineData(true, false, false, "GAME_NOT_FOREGROUND")]
    [InlineData(true, true, true, "RECENT_MOVEMENT")]
    public void HiddenExecutionSkipsBeforeConsoleInput(
        bool available,
        bool gameForeground,
        bool moving,
        string reason)
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time, movingWindowMs: 400);
        if (available) tracker.MarkAvailable();
        if (!moving) time.Advance(TimeSpan.FromMilliseconds(400));
        var windows = new FakeWindowApi
        {
            ForegroundWindowHandle = gameForeground ? GameWindow : new IntPtr(99)
        };
        var gate = new GameInputActivityGate(new FakeGameLocator(FoundGame()), windows, tracker);

        var result = gate.Check("request-1", requireIdle: true);

        Assert.NotNull(result);
        Assert.True(result.Ok);
        var data = JsonSerializer.SerializeToElement(result.Data);
        Assert.False(data.GetProperty("executed").GetBoolean());
        Assert.Equal(reason, data.GetProperty("reason").GetString());
    }

    [Fact]
    public void HiddenIdleExecutionIsAllowed()
    {
        var gate = CreateGate(
            new FakeGameLocator(FoundGame()),
            available: true,
            foreground: GameWindow);

        Assert.Null(gate.Check("request-1", requireIdle: true));
    }

    private static GameInputActivityGate CreateGate(
        FakeGameLocator locator,
        bool available,
        IntPtr foreground)
    {
        var time = new ManualTimeProvider();
        var tracker = new MovementActivityTracker(time, movingWindowMs: 400);
        if (available) tracker.MarkAvailable();
        time.Advance(TimeSpan.FromMilliseconds(400));
        return new GameInputActivityGate(locator, new FakeWindowApi
        {
            ForegroundWindowHandle = foreground
        }, tracker);
    }

    private static GameProcessLookupResult FoundGame()
    {
        var process = new GameProcessInfo(
            GameWindow,
            1,
            "Chivalry2-Win64-Shipping.exe",
            null,
            true,
            "0x2A",
            "Chivalry 2",
            null);
        return GameProcessLookupResult.Found(process, [process]);
    }

    private sealed class FakeGameLocator(GameProcessLookupResult result) : IGameProcessTargetLocator
    {
        public int Calls { get; private set; }

        public GameProcessLookupResult GetTargetProcess()
        {
            Calls++;
            return result;
        }
    }

    private sealed class ManualTimeProvider : TimeProvider
    {
        private long _timestamp;

        public override long TimestampFrequency => TimeSpan.TicksPerSecond;

        public override long GetTimestamp() => _timestamp;

        public void Advance(TimeSpan duration) => _timestamp += duration.Ticks;
    }
}
