using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests;

public sealed class CommandTextBuilderTests
{
    [Fact]
    public void BuildUnbanBuildsValidatedCommand()
    {
        var result = CreateBuilder().BuildUnban(new UnbanRequest("request-1", " PLAYER_1 ", null));

        Assert.True(result.Ok);
        Assert.Equal("UnbanById PLAYER_1", result.Command);
    }

    [Fact]
    public void BuildUnbanCommandsAlwaysReturnsFourIdenticalSubmissions()
    {
        Assert.Equal(
            Enumerable.Repeat("UnbanById ABC123", 4),
            CommandTextBuilder.BuildUnbanCommands("ABC123"));
    }

    [Theory]
    [InlineData("PLAYER_1\nPLAYER_2")]
    [InlineData("PLAYER_1\rPLAYER_2")]
    [InlineData("PLAYER_\"1")]
    public void BuildUnbanRejectsInvalidPlayerIds(string playfabId)
    {
        var result = CreateBuilder().BuildUnban(new UnbanRequest("request-1", playfabId, null));

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Equal("PlayFab id must match ^[A-Za-z0-9_-]{4,128}$.", result.ErrorMessage);
        Assert.Null(result.Command);
    }

    [Theory]
    [InlineData("admin", "Adminsay \"Hello\"")]
    [InlineData("server", "Serversay \"Hello\"")]
    public void BuildMessageBuildsTheRequestedStructuredCommand(string kind, string expected)
    {
        var result = CreateBuilder().BuildMessage(new ConsoleMessageRequest("message-1", kind, "Hello", null));

        Assert.True(result.Ok);
        Assert.Equal(expected, result.Command);
    }

    [Theory]
    [InlineData("admin", "Adminsay \"[SB Wanted] Mock\"")]
    [InlineData("server", "Serversay \"[SB Wanted] Banned\"")]
    public void BuildMessageIgnoresBackgroundTransportMode(
        string kind,
        string expected)
    {
        var message = kind == "admin"
            ? "[SB Wanted] Mock"
            : "[SB Wanted] Banned";

        var result = CreateBuilder().BuildMessage(
            new ConsoleMessageRequest("wanted-message", kind, message, null, Background: true));

        Assert.True(result.Ok);
        Assert.Equal(expected, result.Command);
    }

    [Fact]
    public void BuildMessageAppliesSymbolNormalizationBeforeOutboundNormalization()
    {
        var result = CreateBuilder(new Dictionary<string, string>
        {
            ["Ã¢Ë†â€ "] = "A",
            ["Ã¢â„¢Â¥"] = "heart"
        }).BuildMessage(new ConsoleMessageRequest("message-1", "admin", "MÃ¢Ë†â€ GIC Ã¢â„¢Â¥", null));

        Assert.Equal("Adminsay \"MAGIC heart\"", result.Command);
    }

    [Theory]
    [InlineData("admin", "مرحبا שלום 你好 こんにちは 안녕하세요 नमस्ते", "Adminsay \"مرحبا שלום 你好 こんにちは 안녕하세요 नमस्ते\"")]
    [InlineData("server", "مرحبا שלום 你好 こんにちは 안녕하세요 नमस्ते", "Serversay \"مرحبا שלום 你好 こんにちは 안녕하세요 नमस्ते\"")]
    public void BuildMessagePreservesMiddleEasternAndAsianText(
        string kind,
        string message,
        string expected)
    {
        var result = CreateBuilder().BuildMessage(
            new ConsoleMessageRequest("message-1", kind, message, null));

        Assert.True(result.Ok);
        Assert.Equal(expected, result.Command);
    }

    [Fact]
    public void BuildMessageReplacesQuotesBeforeConstructingTheCommand()
    {
        var result = CreateBuilder().BuildMessage(new ConsoleMessageRequest("message-1", "server", "Say \"hello\"", null));

        Assert.Equal("Serversay \"Say 'hello'\"", result.Command);
    }

    [Theory]
    [InlineData(null, "Message must contain text after sanitization.")]
    [InlineData("\n", "Message cannot contain CR, LF, or NUL.")]
    public void BuildMessageRejectsInvalidMessages(string? message, string expected)
    {
        var result = CreateBuilder().BuildMessage(new ConsoleMessageRequest("message-1", "server", message, null));

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Equal(expected, result.ErrorMessage);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("raw")]
    public void BuildMessageRejectsUnknownKinds(string? kind)
    {
        var result = CreateBuilder().BuildMessage(new ConsoleMessageRequest("message-1", kind, "Hello", null));

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Equal("Message kind must be admin or server.", result.ErrorMessage);
    }

    [Fact]
    public void BuildMessageRejectsInvalidRequestIds()
    {
        var result = CreateBuilder().BuildMessage(new ConsoleMessageRequest("invalid request id", "admin", "Hello", null));

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Equal("Request id must match ^[A-Za-z0-9_.:-]{1,96}$.", result.ErrorMessage);
    }

    [Fact]
    public void BuildBatchBuildsEveryCommandInOrder()
    {
        var builder = CreateBuilder();
        var request = new ConsoleBatchRequest(
            "batch-1",
            [
                new ConsoleBatchCommandRequest("server_message", null, null, "Welcome", 0),
                new ConsoleBatchCommandRequest("kick", "PLAYER_1", null, "Stop FFA", 250),
                new ConsoleBatchCommandRequest("ban", "PLAYER_2", 24, "Cheating", 0)
            ],
            null);

        var result = builder.BuildBatch(request);

        Assert.True(result.Ok);
        Assert.Equal("batch-1", result.RequestId);
        var commands = Assert.IsAssignableFrom<IReadOnlyList<PreparedConsoleCommand>>(result.Commands);
        Assert.Equal(
            ["Serversay \"Welcome\"", "KickById PLAYER_1 \"Stop FFA\"", "BanById PLAYER_2 24 \"Cheating\""],
            commands.Select(command => command.Command));
        Assert.Equal(["server_message", "kick", "ban"], commands.Select(command => command.CommandType));
        Assert.Equal([0, 250, 0], commands.Select(command => command.DelayMs));
    }

    [Fact]
    public void BuildBatchBuildsStructuredUnbanCommands()
    {
        var result = CreateBuilder().BuildBatch(new ConsoleBatchRequest(
            "batch-1",
            [new ConsoleBatchCommandRequest("unban", " PLAYER_1 ", null, null, 25)],
            null));

        Assert.True(result.Ok);
        Assert.Equal(4, result.Commands!.Count);
        Assert.All(result.Commands, command =>
        {
            Assert.Equal("unban", command.CommandType);
            Assert.Equal("UnbanById PLAYER_1", command.Command);
        });
        Assert.Equal([25, 0, 0, 0], result.Commands.Select(command => command.DelayMs));
    }

    [Fact]
    public void BuildBackgroundWantedBanPreservesCommandOrderAndFields()
    {
        var result = CreateBuilder().BuildBatch(new ConsoleBatchRequest(
            "wanted-ban",
            [
                new ConsoleBatchCommandRequest("ban", "PLAYER_1", 999999, "[SB Autoban] Cheating", 0),
                new ConsoleBatchCommandRequest("server_message", null, null, "[SB Wanted] Community banned", 0)
            ],
            null,
            Background: true));

        Assert.True(result.Ok);
        Assert.Equal(
            [
                "BanById PLAYER_1 999999 \"[SB Autoban] Cheating\"",
                "Serversay \"[SB Wanted] Community banned\""
            ],
            result.Commands!.Select(command => command.Command));
    }

    [Fact]
    public void BuildBackgroundWantedUnbanProducesFourUnchangedCommands()
    {
        var result = CreateBuilder().BuildBatch(new ConsoleBatchRequest(
            "wanted-unban",
            [new ConsoleBatchCommandRequest("unban", "PLAYER_1", null, null, 0)],
            null,
            Background: true));

        Assert.True(result.Ok);
        Assert.Equal(4, result.Commands!.Count);
        Assert.All(result.Commands, command =>
        {
            Assert.Equal("unban", command.CommandType);
            Assert.Equal("UnbanById PLAYER_1", command.Command);
        });
    }

    [Fact]
    public void BuildBatchMapsWarnThroughTheServerMessageBuilder()
    {
        var result = CreateBuilder().BuildBatch(new ConsoleBatchRequest(
            "batch-1",
            [new ConsoleBatchCommandRequest("warn", null, null, "Be nice", 0)],
            null));

        Assert.True(result.Ok);
        var command = Assert.Single(result.Commands!);
        Assert.Equal("warn", command.CommandType);
        Assert.Equal("Serversay \"Be nice\"", command.Command);
    }

    [Fact]
    public void BuildBatchPreservesUnicodeServerMessages()
    {
        var result = CreateBuilder().BuildBatch(new ConsoleBatchRequest(
            "batch-1",
            [new ConsoleBatchCommandRequest("server_message", null, null, "مرحبا 你好", 0)],
            null));

        Assert.True(result.Ok);
        Assert.Equal("Serversay \"مرحبا 你好\"", Assert.Single(result.Commands!).Command);
    }

    [Fact]
    public void BuildBatchNormalizesEveryStructuredMessageAndReason()
    {
        var builder = CreateBuilder(new Dictionary<string, string>
        {
            ["∆"] = "A",
            ["♥"] = "heart"
        });
        var result = builder.BuildBatch(new ConsoleBatchRequest(
            "batch-1",
            [
                new ConsoleBatchCommandRequest("server_message", null, null, "M∆GIC ♥", 0),
                new ConsoleBatchCommandRequest("warn", null, null, "M∆GIC ♥", 0),
                new ConsoleBatchCommandRequest("kick", "PLAYER_1", null, "M∆GIC ♥", 0),
                new ConsoleBatchCommandRequest("ban", "PLAYER_2", 24, "M∆GIC ♥", 0)
            ],
            null));

        Assert.True(result.Ok);
        Assert.Equal(
            [
                "Serversay \"MAGIC heart\"",
                "Serversay \"MAGIC heart\"",
                "KickById PLAYER_1 \"MAGIC heart\"",
                "BanById PLAYER_2 24 \"MAGIC heart\""
            ],
            result.Commands!.Select(command => command.Command));
    }

    [Fact]
    public void BuildBatchAcceptsCommandListsBeyondTheOldSixtyFourLimit()
    {
        var commands = Enumerable.Range(0, 250).Select(_ => Warn()).ToArray();

        var result = CreateBuilder().BuildBatch(Batch(commands));

        Assert.True(result.Ok);
        Assert.Equal(250, result.Commands!.Count);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(14)]
    [InlineData(15)]
    [InlineData(400)]
    public void BuildBatchPreservesConfiguredActionDelays(int requestedDelayMs)
    {
        var result = CreateBuilder().BuildBatch(Batch([Warn(delayMs: requestedDelayMs)]));

        Assert.True(result.Ok);
        Assert.Equal(requestedDelayMs, Assert.Single(result.Commands!).DelayMs);
    }

    [Theory]
    [MemberData(nameof(InvalidBatchRequests))]
    public void BuildBatchRejectsInvalidRequests(string _, ConsoleBatchRequest request)
    {
        var result = CreateBuilder().BuildBatch(request);

        Assert.False(result.Ok);
        Assert.Equal("INVALID_REQUEST", result.ErrorCode);
        Assert.Null(result.Commands);
    }

    public static IEnumerable<object[]> InvalidBatchRequests()
    {
        yield return ["missing command list", new ConsoleBatchRequest("batch-1", null, null)];
        yield return ["empty command list", Batch([])];
        yield return ["unsupported command type after a valid command", Batch([Warn(), Warn(commandType: "raw")])];
        yield return ["null command after a valid command", Batch([Warn(), null!])];
        yield return ["missing kick player id", Batch([new ConsoleBatchCommandRequest("kick", null, null, "Reason", 0)])];
        yield return ["missing ban player id", Batch([new ConsoleBatchCommandRequest("ban", null, 24, "Reason", 0)])];
        yield return ["invalid ban hours", Batch([new ConsoleBatchCommandRequest("ban", "PLAYER_1", 0, "Reason", 0)])];
        yield return ["invalid message", Batch([Warn(message: "\n")])];
        yield return ["negative delay", Batch([Warn(delayMs: -1)])];
        yield return ["missing delay", Batch([Warn(delayMs: null)])];
        yield return ["invalid request id", Batch([Warn()], "invalid request id")];
    }

    private static CommandTextBuilder CreateBuilder(
        IReadOnlyDictionary<string, string>? mapping = null)
    {
        var options = new CoreHostOptions();
        var normalization = new SymbolNormalization(
            mapping ?? new Dictionary<string, string>());
        return new CommandTextBuilder(
            new CoreTextSanitizer(normalization),
            new StaticOptionsMonitor(options));
    }

    private static ConsoleBatchRequest Batch(
        IReadOnlyList<ConsoleBatchCommandRequest> commands,
        string id = "batch-1")
    {
        return new ConsoleBatchRequest(id, commands, null);
    }

    private static ConsoleBatchCommandRequest Warn(
        string commandType = "warn",
        string? message = "Message",
        int? delayMs = 0)
    {
        return new ConsoleBatchCommandRequest(commandType, null, null, message, delayMs);
    }

    private sealed class StaticOptionsMonitor(CoreHostOptions options) : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue => options;

        public CoreHostOptions Get(string? name) => options;

        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
