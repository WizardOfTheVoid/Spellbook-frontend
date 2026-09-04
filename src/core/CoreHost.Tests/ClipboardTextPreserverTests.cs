using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class ClipboardTextPreserverTests
{
    [Fact]
    public async Task ExecuteAsyncRestoresOriginalTextAfterCommandCompletes()
    {
        var clipboardText = "important text";
        var commandResult = ConsoleExecutionResult.Success("request-1", "ListPlayers", new { players = 2 });

        var result = await ClipboardTextPreserver.ExecuteAsync(
            _ => Task.FromResult(ClipboardTextResult.TextValue(clipboardText)),
            (text, _) =>
            {
                clipboardText = text;
                return Task.FromResult(OperationResult.Success());
            },
            () =>
            {
                clipboardText = "ListPlayers output";
                return Task.FromResult(commandResult);
            },
            CancellationToken.None);

        Assert.Same(commandResult, result);
        Assert.Equal("important text", clipboardText);
    }

    [Fact]
    public async Task ExecuteAsyncRecordsClipboardSaveAndRestoreTimings()
    {
        var timing = new TimingLog();
        var timingLines = new List<string>();

        await ClipboardTextPreserver.ExecuteAsync(
            _ => Task.FromResult(ClipboardTextResult.TextValue("original")),
            (_, _) => Task.FromResult(OperationResult.Success()),
            () => Task.FromResult(ConsoleExecutionResult.Success("request-1", "ListPlayers", new { players = 2 })),
            CancellationToken.None,
            timing);
        timing.Write("core-command-timing", timingLines.Add, "requestId=request-1");

        var timingLine = Assert.Single(timingLines);
        Assert.Contains(" clipboardSave=", timingLine);
        Assert.Contains(" clipboardRestore=", timingLine);
    }

    [Fact]
    public async Task ExecuteAsyncLeavesCommandOutputWhenRestoreIsDisabled()
    {
        var clipboardText = "important text";
        var reads = 0;
        var restores = 0;

        await ClipboardTextPreserver.ExecuteAsync(
            _ =>
            {
                reads++;
                return Task.FromResult(ClipboardTextResult.TextValue(clipboardText));
            },
            (text, _) =>
            {
                restores++;
                clipboardText = text;
                return Task.FromResult(OperationResult.Success());
            },
            () =>
            {
                clipboardText = "ListPlayers output";
                return Task.FromResult(ConsoleExecutionResult.Success("request-1", "ListPlayers", new { players = 2 }));
            },
            CancellationToken.None,
            restoreClipboard: false);

        Assert.Equal("ListPlayers output", clipboardText);
        Assert.Equal(0, reads);
        Assert.Equal(0, restores);
    }
}
