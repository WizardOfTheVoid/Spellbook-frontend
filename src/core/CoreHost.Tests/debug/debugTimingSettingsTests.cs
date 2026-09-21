using CoreHost.Debug;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests.Debug;

public sealed class DebugTimingSettingsTests
{
    [Fact]
    public void authorLifetimesRemainIndependentAcrossOverridesAndReset()
    {
        using var settings = new DebugTimingSettings(new Monitor(), null);
        Assert.Equal(30000, settings.snapshot()["Queue__UserActionTtlMs"]);
        Assert.Equal(15000, settings.snapshot()["Queue__SystemActionTtlMs"]);
        settings.update(new Dictionary<string, double> { ["Queue__UserActionTtlMs"] = 45000 });
        settings.update(new Dictionary<string, double> { ["Queue__SystemActionTtlMs"] = 20000, ["QUEUE_GATE_NORMAL"] = 50 });
        Assert.Equal(45000, settings.CurrentValue.Queue.UserActionTtlMs);
        Assert.Equal(20000, settings.CurrentValue.Queue.SystemActionTtlMs);
        settings.update(reset: true);
        Assert.Equal(30000, settings.CurrentValue.Queue.UserActionTtlMs);
        Assert.Equal(15000, settings.CurrentValue.Queue.SystemActionTtlMs);
    }

    [Fact]
    public void temporaryOverridesUseLoadedValuesAndResetWithoutWriting()
    {
        var options = new Monitor();
        options.CurrentValue.QueueGateNormal = 1900;
        using var settings = new DebugTimingSettings(options, null);
        Assert.Equal(1900, settings.snapshot()["QUEUE_GATE_NORMAL"]);
        settings.update(new Dictionary<string, double> { ["QUEUE_GATE_NORMAL"] = 50 });
        Assert.Equal(50, settings.CurrentValue.QueueGateNormal);
        Assert.Equal(1900, options.CurrentValue.QueueGateNormal);
        settings.update(reset: true);
        Assert.Equal(1900, settings.CurrentValue.QueueGateNormal);
    }

    [Theory]
    [InlineData("Core__Port", 123)]
    [InlineData("Queue__MaxPendingActions", 10)]
    [InlineData("QUEUE_GATE_NORMAL", -1)]
    [InlineData("QUEUE_GATE_NORMAL", 1.5)]
    [InlineData("Queue__RecheckMs", 0)]
    [InlineData("QUEUE_GATE_NORMAL", double.NaN)]
    [InlineData("Window__FocusTimeoutMs", double.PositiveInfinity)]
    public void rejectsUnknownOrInvalidSettingsWithoutPartialChanges(string key, double value)
    {
        using var settings = new DebugTimingSettings(new Monitor(), null);
        Assert.Throws<ArgumentException>(() => settings.update(new Dictionary<string, double>
            { ["Input__SubmitSettleMs"] = 5, [key] = value }));
        Assert.Equal(20, settings.CurrentValue.Input.SubmitSettleMs);
    }

    [Fact]
    public void savePreservesUnrelatedValuesAndMakesResetUseTheNewSavedTiming()
    {
        var path = Path.Combine(Path.GetTempPath(), $"spellbook-debug-{Guid.NewGuid():N}.env");
        try
        {
            File.WriteAllText(path, "# local settings\r\nCORE__AUTHTOKEN=private-test-value\r\nexport QUEUE_GATE_NORMAL=1900\r\nUNKNOWN=leave exactly this\r\n");
            var options = new Monitor();
            options.CurrentValue.QueueGateNormal = 1900;
            using var settings = new DebugTimingSettings(options, path);
            settings.update(new Dictionary<string, double> { ["QUEUE_GATE_NORMAL"] = 75 });
            Assert.Contains("export QUEUE_GATE_NORMAL=1900", File.ReadAllText(path));
            settings.update(save: true);
            var saved = File.ReadAllText(path);
            Assert.Contains("CORE__AUTHTOKEN=private-test-value\r\n", saved);
            Assert.Contains("UNKNOWN=leave exactly this\r\n", saved);
            Assert.Contains("export QUEUE_GATE_NORMAL=75\r\n", saved);
            Assert.Contains("# local settings\r\n", saved);
            settings.update(new Dictionary<string, double> { ["QUEUE_GATE_NORMAL"] = 10 });
            settings.update(reset: true);
            Assert.Equal(75, settings.CurrentValue.QueueGateNormal);
        }
        finally { File.Delete(path); }
    }

    private sealed class Monitor : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue { get; } = new();
        public CoreHostOptions Get(string? name) => CurrentValue;
        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
