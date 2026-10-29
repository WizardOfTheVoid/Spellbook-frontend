using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests.Runtime;

public sealed class RuntimeOptionsTests
{
    [Theory]
    [InlineData(1900, 2500, 500)]
    [InlineData(0, 0, 0)]
    [InlineData(90000, 60000, 30000)]
    public void criticalGateIsZeroRegardlessOfOtherPrioritySettings(int normal, int low, int high)
    {
        var options = new CoreHostOptions { QueueGateNormal = normal, QueueGateLow = low, QueueGateHigh = high };
        Assert.Equal(0, options.gateMs("critical"));
        Assert.Equal(normal, options.gateMs("normal"));
        Assert.Equal(low, options.gateMs("low"));
        Assert.Equal(high, options.gateMs("high"));
    }

    [Theory]
    [InlineData("Window:FocusTimeoutMs", "0")]
    [InlineData("Window:ProcessPollMs", "0")]
    [InlineData("Window:FocusSettleMs", "-1")]
    [InlineData("Window:RestoreSettleMs", "-1")]
    [InlineData("QUEUE_GATE_NORMAL", "-1")]
    [InlineData("QUEUE_GATE_LOW", "-1")]
    [InlineData("QUEUE_GATE_HIGH", "-1")]
    [InlineData("Input:SubmitSettleMs", "-1")]
    [InlineData("Input:ChatCooldownMs", "0")]
    [InlineData("Queue:UserActionTtlMs", "0")]
    [InlineData("Queue:SystemActionTtlMs", "0")]
    [InlineData("Queue:CommandTimeoutMs", "0")]
    [InlineData("Queue:RecheckMs", "0")]
    [InlineData("Queue:MaxPendingActions", "0")]
    [InlineData("Clipboard:OutputTimeoutMs", "0")]
    [InlineData("Clipboard:PollMs", "0")]
    [InlineData("Debug:EventLimit", "0")]
    [InlineData("Debug:EventLimit", "10001")]
    [InlineData("Debug:SessionLeaseMs", "0")]
    public async Task productionRegistrationRejectsInvalidRuntimeOptionsAtStartup(string key, string value)
    {
        await Assert.ThrowsAsync<OptionsValidationException>(async () =>
        {
            await using var host = await RuntimeEndpointHost.start(configuration: new Dictionary<string, string?> { [key] = value });
        });
    }
}
