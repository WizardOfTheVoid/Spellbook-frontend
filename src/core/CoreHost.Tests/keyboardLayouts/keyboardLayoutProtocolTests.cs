using CoreHost.Actions;

namespace CoreHost.Tests.KeyboardLayouts;

public sealed class KeyboardLayoutProtocolTests
{
    private static CoreActionRequest action(params CoreCommand[] commands) => new("id", "key", "user", "normal", new(11, "0x1"), commands);

    [Theory]
    [InlineData(null)]
    [InlineData("00000000")]
    [InlineData("US")]
    public void ordinaryConsoleRequiresLayout(string? layout) => Assert.NotNull(ActionValidation.error(action(new CoreCommand("console", "ListPlayers", "Minus", KeyboardLayoutId: layout))));

    [Fact]
    public void detectIsRestrictedToSingleOutputListPlayers()
    {
        var probe = new CoreCommand("console", "ListPlayers", "Minus", ExpectClipboard: true, KeyboardLayoutId: "detect");
        Assert.Null(ActionValidation.error(action(probe)));
        Assert.NotNull(ActionValidation.error(action(probe, probe)));
        Assert.NotNull(ActionValidation.error(action(probe with { Command = "Other" })));
        Assert.NotNull(ActionValidation.error(action(probe with { ExpectClipboard = false })));
        Assert.Null(ActionValidation.error(action(new CoreCommand("keys", Presses: [new(65, 0)]))));
    }
}
