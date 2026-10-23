using CoreHost.Actions;
using CoreHost.Clipboard;
using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;
using CoreHost.Debug;
using CoreHost.KeyboardLayouts;
using System.Diagnostics;

namespace CoreHost.Commands;

public sealed class ConsoleCommandRunner(KeyboardInput keyboard, CommandClipboard clipboard,
    ListPlayersParser parser, ConsoleCommandActivity activity, IOptionsMonitor<CoreHostOptions> options, KeyboardLayoutService layouts, DebugJournal? journal = null)
{
    private string? consoleKey;
    private string? consoleLayout;
    private GameProcessInfo? consoleGame;
    private int closePressesRemaining;
    public bool needsCleanup => closePressesRemaining > 0;
    private LastListPlayersSummary? lastPlayers;
    public LastListPlayersSummary? lastListPlayers => Volatile.Read(ref lastPlayers);
    public KeyboardLayoutFault? layoutFault => layouts.pendingRestoration;
    public void closed() { closePressesRemaining = 0; consoleKey = null; consoleLayout = null; consoleGame = null; }

    private void consoleOpen(string key, string layout, GameProcessInfo game)
    {
        consoleKey = key;
        consoleLayout = layout;
        consoleGame = game;
        closePressesRemaining = 2;
        journal?.phase("console_open");
        keyboard.open(key);
    }

    public void consoleSubmit(Action? submitted = null)
    {
        journal?.phase("console_submit");
        keyboard.enter(() => { closed(); submitted?.Invoke(); });
    }

    public async Task consoleDiscard(GameProcessInfo game, Action check, CancellationToken token)
    {
        if (!needsCleanup) return;
        if (consoleGame?.Id != game.Id || consoleGame.WindowHandle != game.WindowHandle) { closed(); return; }
        var lease = await layouts.acquire(game, consoleLayout!, check, token);
        long? inputAt = null;
        try
        {
            while (closePressesRemaining > 0)
            {
                check();
                lease.check();
                sendInput(() => keyboard.open(consoleKey!), ref inputAt);
                closePressesRemaining--;
            }
            closed();
        }
        finally
        {
            await settleAndRestore(lease, inputAt);
        }
    }

    public async Task<CommandOutcome> run(CoreCommand command, GameProcessInfo game, Action check, Action submitted, CancellationToken token,
        Action<string>? warn = null, ConsoleSubmissionContext? context = null)
    {
        var sent = false;
        var warnings = new List<string>();
        object? output = null;
        string? code = null;
        string? message = null;
        KeyboardLayoutInfo? detected = null;
        var expectsOutput = command.ExpectClipboard || command.Command!.Equals("ListPlayers", StringComparison.OrdinalIgnoreCase);
        try
        {
            check();
            journal?.phase("clipboard_write");
            await clipboard.write(command.Command!, command.RestoreClipboard, token);
            var lease = await layouts.acquire(game, command.KeyboardLayoutId ?? throw new KeyboardLayoutException("KEYBOARD_LAYOUT_REQUIRED", "A console keyboard layout is required."), check, token);
            detected = lease.detectedLayout;
            long? inputAt = null;
            try
            {
                check(); lease.check();
                sendInput(() => consoleOpen(command.ConsoleKey!, detected.Id, game), ref inputAt);
                check(); lease.check();
                clipboard.verifyCommand();
                journal?.phase("console_paste");
                sendInput(keyboard.paste, ref inputAt);
                check(); lease.check();
                clipboard.verifyCommand();
                sendInput(() => consoleSubmit(() =>
                {
                    sent = true;
                    activity.Record(command.Command!, context);
                    submitted();
                }), ref inputAt);
            }
            finally
            {
                await settleAndRestore(lease, inputAt);
            }
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
        catch (OperationCanceledException) { code = "COMMAND_CANCELLED"; }
        catch (InputInterruptedException exception) { return new(sent, ErrorCode: exception.Message, Paused: exception.Message != "GAME_SESSION_CHANGED", KeyboardLayout: detected); }
        catch (Exception exception)
        {
            code = exception is KeyboardLayoutException layout ? layout.code : exception is TimeoutException ? "CLIPBOARD_TIMEOUT" : exception is ClipboardChangedException ? "CLIPBOARD_CHANGED" : "INPUT_FAILED";
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
        return new(sent, output, code, message, Warnings: warnings, KeyboardLayout: detected);
    }

    private static void sendInput(Action send, ref long? inputAt)
    {
        try { send(); }
        finally { inputAt = Stopwatch.GetTimestamp(); }
    }

    private async Task settleAndRestore(KeyboardLayoutLease lease, long? inputAt)
    {
        using var cleanup = new CancellationTokenSource(options.CurrentValue.KeyboardLayouts.CleanupBudgetMs);
        try
        {
            keyboard.releaseAll();
            if (lease.changed && inputAt is { } timestamp)
            {
                var remaining = Math.Max(0, lease.inputSettleMs - Stopwatch.GetElapsedTime(timestamp).TotalMilliseconds);
                await Task.Delay(TimeSpan.FromMilliseconds(remaining), cleanup.Token);
            }
        }
        finally
        {
            journal?.phase("keyboard_layout_restore");
            var restored = await lease.restore(cleanup.Token);
            if (!restored.Ok) throw new KeyboardLayoutException(restored.ErrorCode!, restored.ErrorMessage!);
        }
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
