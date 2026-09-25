using CoreHost.Actions;
using CoreHost.Clipboard;
using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;
using CoreHost.Debug;

namespace CoreHost.Commands;

public sealed class ConsoleCommandRunner(KeyboardInput keyboard, CommandClipboard clipboard,
    ListPlayersParser parser, ConsoleCommandActivity activity, IOptionsMonitor<CoreHostOptions> options, DebugJournal? journal = null)
{
    private string? consoleKey;
    private int closePressesRemaining;
    public bool needsCleanup => closePressesRemaining > 0;
    private LastListPlayersSummary? lastPlayers;
    public LastListPlayersSummary? lastListPlayers => Volatile.Read(ref lastPlayers);
    public void closed() { closePressesRemaining = 0; consoleKey = null; }

    public void consoleOpen(string key)
    {
        consoleKey = key;
        closePressesRemaining = 2;
        journal?.phase("console_open");
        keyboard.open(key);
    }

    public void consoleSubmit(Action? submitted = null)
    {
        journal?.phase("console_submit");
        keyboard.enter(() => { closed(); submitted?.Invoke(); });
    }

    public void consoleDiscard()
    {
        while (closePressesRemaining > 0)
        {
            keyboard.open(consoleKey!);
            closePressesRemaining--;
        }
        closed();
    }

    public async Task<CommandOutcome> run(CoreCommand command, Action check, Action submitted, CancellationToken token,
        Action<string>? warn = null)
    {
        var sent = false;
        var warnings = new List<string>();
        object? output = null;
        string? code = null;
        string? message = null;
        var expectsOutput = command.ExpectClipboard || command.Command!.Equals("ListPlayers", StringComparison.OrdinalIgnoreCase);
        try
        {
            check();
            journal?.phase("clipboard_write");
            await clipboard.write(command.Command!, command.RestoreClipboard, token);
            check();
            consoleOpen(command.ConsoleKey!);
            check();
            clipboard.verifyCommand();
            journal?.phase("console_paste");
            keyboard.paste();
            check();
            clipboard.verifyCommand();
            consoleSubmit(() =>
            {
                sent = true;
                submitted();
                activity.Record(command.Command!);
            });
            if (expectsOutput)
            {
                journal?.phase("clipboard_wait");
                output = await readOutput(command.Command!, token);
            }
            if (output is ListPlayersParseResult parsed)
            {
                Volatile.Write(ref lastPlayers, new(DateTimeOffset.UtcNow, parsed.ServerName, parsed.Players.Count));
                if (parsed.ParseWarnings.Count > 0) warnings.AddRange(parsed.ParseWarnings.Prepend("LISTPLAYERS_PARSE_PARTIAL"));
            }
            journal?.phase("submit_settle");
            await Task.Delay(options.CurrentValue.Input.SubmitSettleMs, token);
        }
        catch (OperationCanceledException) when (sent && (!expectsOutput || output is not null)) { }
        catch (OperationCanceledException) { throw; }
        catch (InputInterruptedException) { throw; }
        catch (Exception exception)
        {
            code = exception is TimeoutException ? "CLIPBOARD_TIMEOUT" : exception is ClipboardChangedException ? "CLIPBOARD_CHANGED" : "INPUT_FAILED";
            message = exception.Message;
        }
        finally
        {
            using var cleanup = new CancellationTokenSource(2000);
            try
            {
                journal?.phase("clipboard_restore");
                var warning = await clipboard.restore(cleanup.Token);
                if (warning is not null) warnings.Add(warning);
            }
            catch (Exception exception) { warnings.Add($"CLIPBOARD_RESTORE_FAILED: {exception.Message}"); }
            if (warn is not null) foreach (var warning in warnings) warn(warning);
        }
        return new(sent, output, code, message, Warnings: warnings);
    }

    private async Task<object> readOutput(string command, CancellationToken token)
    {
        var config = options.CurrentValue.Clipboard;
        var deadline = Environment.TickCount64 + config.OutputTimeoutMs;
        var listPlayers = command.Equals("ListPlayers", StringComparison.OrdinalIgnoreCase);
        while (Environment.TickCount64 < deadline)
        {
            token.ThrowIfCancellationRequested();
            var text = await clipboard.readChanged(value =>
                !string.IsNullOrWhiteSpace(value) && !value.Trim().Equals(command, StringComparison.OrdinalIgnoreCase) &&
                (!listPlayers || parser.LooksLikeListPlayersOutput(value)), token);
            if (text is not null) return listPlayers ? parser.Parse(text) : new { rawText = text };
            await Task.Delay(config.PollMs, token);
        }
        throw new TimeoutException("No valid clipboard output arrived after the Command was submitted.");
    }
}

public sealed class InputInterruptedException(string reason) : Exception(reason);
