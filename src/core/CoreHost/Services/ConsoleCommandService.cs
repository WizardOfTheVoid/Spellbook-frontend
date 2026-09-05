using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class ConsoleCommandService
{
    private readonly ConsoleCommandGate _commandGate;
    private readonly IOptionsMonitor<CoreHostOptions> _options;
    private readonly IConsoleExecutionTargetResolver _executionTargets;
    private readonly ForegroundWindowService _foreground;
    private readonly SendInputService _sendInput;
    private readonly ConsoleCommandCleanupService _cleanup;
    private readonly IClipboardService _clipboard;
    private readonly ListPlayersParser _listPlayersParser;
    private readonly IGameInputActivityGate _activityGate;
    private readonly ConsoleCommandBatchService _batchService;
    private readonly object _listPlayersCoalesceLock = new();
    private InFlightListPlayers? _inFlightListPlayers;
    private CachedListPlayersResult? _cachedListPlayers;
    private LastListPlayersSummary? _lastListPlayers;

    public ConsoleCommandService(
        IOptionsMonitor<CoreHostOptions> options,
        ConsoleCommandGate commandGate,
        IConsoleExecutionTargetResolver executionTargets,
        ForegroundWindowService foreground,
        SendInputService sendInput,
        ConsoleCommandCleanupService cleanup,
        IClipboardService clipboard,
        ListPlayersParser listPlayersParser,
        IGameInputActivityGate activityGate,
        ConsoleCommandBatchService batchService)
    {
        _options = options;
        _commandGate = commandGate;
        _executionTargets = executionTargets;
        _foreground = foreground;
        _sendInput = sendInput;
        _cleanup = cleanup;
        _clipboard = clipboard;
        _listPlayersParser = listPlayersParser;
        _activityGate = activityGate;
        _batchService = batchService;
    }

    public LastListPlayersSummary? GetLastListPlayersSummary()
    {
        return Volatile.Read(ref _lastListPlayers);
    }

    public async Task<ConsoleExecutionResult> ExecuteRawAsync(RawConsoleCommandRequest request, CancellationToken cancellationToken)
    {
        if (!RequestValidators.TryNormalizeRequestId(request.Id, out var requestId, out var requestIdError))
        {
            return ConsoleExecutionResult.Failure("INVALID_REQUEST", requestIdError!, requestId);
        }

        if (!_options.CurrentValue.Core.AllowRawConsoleCommand)
        {
            return ConsoleExecutionResult.Failure("FORBIDDEN_CAPABILITY", "Raw console commands are disabled by Core configuration.", requestId, StatusCodes.Status403Forbidden);
        }

        if (!RequestValidators.TryNormalizeCommand(request.Command, out var command, out var commandError))
        {
            return ConsoleExecutionResult.Failure("INVALID_REQUEST", commandError!, requestId);
        }

        var repeatedUnban = CommandTextBuilder.BuildRawUnbanCommands(command);
        if (repeatedUnban is not null)
        {
            return await _batchService.ExecuteAsync(
                requestId,
                repeatedUnban,
                request.RestoreTarget,
                background: false,
                requireIdle: false,
                cancellationToken).ConfigureAwait(false);
        }

        var expectClipboard = request.ExpectClipboard == true || IsListPlayersCommand(command);
        return await ExecuteCommandAsync(
            requestId,
            command,
            expectClipboard,
            request.TimeoutMs,
            request.RestoreTarget,
            background: false,
            requireIdle: false,
            cancellationToken,
            request.RestoreClipboard != false).ConfigureAwait(false);
    }

    public Task<ConsoleExecutionResult> ExecuteListPlayersAsync(
        ListPlayersRequest request,
        CancellationToken cancellationToken)
    {
        return ExecuteCommandAsync(
            request.Id ?? string.Empty,
            "ListPlayers",
            expectClipboard: true,
            request.TimeoutMs,
            request.RestoreTarget,
            request.Background == true,
            request.RequireIdle == true,
            cancellationToken,
            restoreClipboard: true);
    }

    public async Task<ConsoleExecutionResult> ExecuteCommandAsync(
        string requestId,
        string command,
        bool expectClipboard,
        JsonElement? restoreTarget,
        CancellationToken cancellationToken)
    {
        return await ExecuteCommandAsync(
            requestId,
            command,
            expectClipboard,
            null,
            restoreTarget,
            background: false,
            requireIdle: false,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<ConsoleExecutionResult> ExecuteCommandAsync(
        string requestId,
        string command,
        bool expectClipboard,
        JsonElement? restoreTarget,
        bool background,
        CancellationToken cancellationToken)
    {
        return await ExecuteCommandAsync(
            requestId,
            command,
            expectClipboard,
            null,
            restoreTarget,
            background,
            requireIdle: false,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<ConsoleExecutionResult> ExecuteCommandAsync(
        string requestId,
        string command,
        bool expectClipboard,
        JsonElement? restoreTarget,
        bool background,
        bool requireIdle,
        CancellationToken cancellationToken)
    {
        return await ExecuteCommandAsync(
            requestId,
            command,
            expectClipboard,
            null,
            restoreTarget,
            background,
            requireIdle,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<ConsoleExecutionResult> ExecuteCommandAsync(
        string requestId,
        string command,
        bool expectClipboard,
        int? timeoutMs,
        JsonElement? restoreTarget,
        bool background,
        bool requireIdle,
        CancellationToken cancellationToken,
        bool restoreClipboard = true)
    {
        if (!RequestValidators.TryNormalizeRequestId(requestId, out var normalizedRequestId, out var requestIdError))
        {
            return ConsoleExecutionResult.Failure("INVALID_REQUEST", requestIdError!, normalizedRequestId);
        }

        if (!RequestValidators.TryNormalizeCommand(command, out var normalizedCommand, out var commandError))
        {
            return ConsoleExecutionResult.Failure("INVALID_REQUEST", commandError!, normalizedRequestId);
        }

        if (requireIdle && !background)
        {
            return ConsoleExecutionResult.Failure(
                "INVALID_REQUEST",
                "RequireIdle can only be used with background execution.",
                normalizedRequestId);
        }

        var restoreTargetValidation = _executionTargets.Resolve(
            restoreTarget,
            background);
        if (!restoreTargetValidation.Ok || restoreTargetValidation.Target is null)
        {
            return RestoreTargetFailure(restoreTargetValidation, normalizedRequestId);
        }

        var validatedRestoreTarget = restoreTargetValidation.Target;
        if (IsListPlayersCommand(normalizedCommand) && restoreClipboard)
        {
            return await ExecuteListPlayersCoalescedAsync(
                normalizedRequestId,
                timeoutMs,
                validatedRestoreTarget,
                background,
                requireIdle).ConfigureAwait(false);
        }

        return await ExecuteCommandSerializedAsync(
            normalizedRequestId,
            normalizedCommand,
            expectClipboard,
            timeoutMs,
            validatedRestoreTarget,
            background,
            requireIdle,
            cancellationToken,
            restoreClipboard).ConfigureAwait(false);
    }

    private async Task<ConsoleExecutionResult> ExecuteListPlayersCoalescedAsync(
        string requestId,
        int? timeoutMs,
        ValidatedRestoreTarget restoreTarget,
        bool background,
        bool requireIdle)
    {
        InFlightListPlayers inFlight;
        var cacheTtl = TimeSpan.FromMilliseconds(Math.Max(0, _options.CurrentValue.Timing.ListPlayersCacheTtlMs));
        lock (_listPlayersCoalesceLock)
        {
            if (cacheTtl > TimeSpan.Zero &&
                _cachedListPlayers is { } cached &&
                cached.Target == restoreTarget &&
                cached.Background == background &&
                cached.RequireIdle == requireIdle &&
                DateTimeOffset.UtcNow - cached.TimestampUtc <= cacheTtl)
            {
                return cached.Result with { RequestId = requestId };
            }

            if (_inFlightListPlayers is { } existing &&
                !existing.Task.IsCompleted &&
                existing.Target == restoreTarget &&
                existing.Background == background &&
                existing.RequireIdle == requireIdle)
            {
                inFlight = existing;
            }
            else
            {
                inFlight = new InFlightListPlayers(
                    restoreTarget,
                    background,
                    requireIdle,
                    ExecuteCommandSerializedAsync(
                        requestId,
                        "ListPlayers",
                        expectClipboard: true,
                        timeoutMs,
                        restoreTarget,
                        background,
                        requireIdle,
                        CancellationToken.None));
                _inFlightListPlayers = inFlight;
            }
        }

        var result = await inFlight.Task.ConfigureAwait(false);

        lock (_listPlayersCoalesceLock)
        {
            if (result.Ok && !HasRestorationWarning(result))
            {
                _cachedListPlayers = new CachedListPlayersResult(
                    restoreTarget,
                    background,
                    requireIdle,
                    DateTimeOffset.UtcNow,
                    result);
            }

            if (ReferenceEquals(_inFlightListPlayers, inFlight) && inFlight.Task.IsCompleted)
            {
                _inFlightListPlayers = null;
            }
        }

        return result with { RequestId = requestId };
    }

    private async Task<ConsoleExecutionResult> ExecuteCommandSerializedAsync(
        string normalizedRequestId,
        string normalizedCommand,
        bool expectClipboard,
        int? timeoutMs,
        ValidatedRestoreTarget restoreTarget,
        bool background,
        bool requireIdle,
        CancellationToken cancellationToken,
        bool restoreClipboard = true)
    {
        var timing = new TimingLog();
        var configuredTimeoutMs = Math.Max(250, timeoutMs ?? _options.CurrentValue.Timing.CommandTimeoutMs);
        if (expectClipboard || IsListPlayersCommand(normalizedCommand))
        {
            configuredTimeoutMs = Math.Max(configuredTimeoutMs, _options.CurrentValue.Timing.ClipboardChangeTimeoutMs + 1000);
        }

        using var timeoutSource = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeoutSource.CancelAfter(configuredTimeoutMs);

        ConsoleCommandLease? lease = null;
        Func<Task<ConsoleExecutionResult>>? sessionCleanup = null;
        var requiresCleanup = false;
        ConsoleExecutionResult result;
        try
        {
            lease = await timing.MeasureAsync(
                "gateWait",
                () => _commandGate.WaitAsync(restoreTarget, timeoutSource.Token)).ConfigureAwait(false);
            requiresCleanup = !lease.StartsSession;

            var activitySkip = _activityGate.Check(normalizedRequestId, requireIdle);
            if (activitySkip is not null)
            {
                result = activitySkip;
                sessionCleanup = () => _cleanup.CompleteAsync(
                    result,
                    consoleMayBeOpen: !lease.StartsSession,
                    commandSubmitted: false,
                    restoreTarget,
                    restoreForeground: false);
            }
            else
            {
                var restoreTargetValidation = _executionTargets.Validate(
                    restoreTarget,
                    requireForeground: !background && lease.StartsSession);
                if (!restoreTargetValidation.Ok || restoreTargetValidation.Target is null)
                {
                    result = RestoreTargetFailure(restoreTargetValidation, normalizedRequestId);
                }
                else
                {
                    requiresCleanup = true;
                    Task<ConsoleExecutionResult> ExecuteCoreAsync() => ExecuteCommandCoreAsync(
                        normalizedRequestId,
                        normalizedCommand,
                        expectClipboard || IsListPlayersCommand(normalizedCommand),
                        restoreTargetValidation.Target,
                        background,
                        timeoutSource.Token,
                        timing,
                        cleanup => sessionCleanup = cleanup);

                    result = IsListPlayersCommand(normalizedCommand)
                        ? await ClipboardTextPreserver.ExecuteAsync(
                            _clipboard.ReadTextAsync,
                            _clipboard.SetTextAsync,
                            ExecuteCoreAsync,
                            timeoutSource.Token,
                            timing,
                            restoreClipboard).ConfigureAwait(false)
                        : await ExecuteCoreAsync().ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException)
        {
            result = ConsoleExecutionResult.Failure("COMMAND_TIMEOUT", "Console command execution timed out.", normalizedRequestId, StatusCodes.Status504GatewayTimeout);
        }
        catch (Exception ex)
        {
            result = ConsoleExecutionResult.Failure("INPUT_FAILED", $"Console command execution failed: {ex.Message}", normalizedRequestId, StatusCodes.Status500InternalServerError);
        }

        var cleanupAvailable = sessionCleanup is not null;
        timing.Write(
            "core-command-timing",
            $"requestId={normalizedRequestId}",
            $"command=\"{normalizedCommand}\"",
            $"cleanup={(cleanupAvailable ? "session" : "none")}");

        if (lease is null)
        {
            return result;
        }

        Func<Task<IReadOnlyList<string>>> closeSession = requiresCleanup
            ? () => CompleteSessionAsync(
                normalizedRequestId,
                result,
                sessionCleanup ?? (() => _cleanup.CompleteAsync(
                    result,
                    consoleMayBeOpen: false,
                    commandSubmitted: false,
                    restoreTarget,
                    restoreForeground: !background)))
            : () => Task.FromResult<IReadOnlyList<string>>([]);
        var sessionWarnings = await _commandGate.CompleteAsync(
            lease,
            result.Ok && cleanupAvailable,
            closeSession,
            _options.CurrentValue.Timing.AfterQueueEmptyMs).ConfigureAwait(false);
        return result.WithWarnings(sessionWarnings);
    }

    private async Task<ConsoleExecutionResult> ExecuteCommandCoreAsync(
        string requestId,
        string command,
        bool expectClipboard,
        ValidatedRestoreTarget restoreTarget,
        bool background,
        CancellationToken cancellationToken,
        TimingLog timing,
        Action<Func<Task<ConsoleExecutionResult>>> deferCleanup)
    {
        var consoleOpenAttempt = new ConsoleOpenAttemptState();
        Task<ConsoleExecutionResult> CompleteAsync(ConsoleExecutionResult result)
        {
            deferCleanup(
                () => _cleanup.CompleteAsync(
                    result,
                    consoleOpenAttempt.MayBeOpen,
                    consoleOpenAttempt.CommandSubmitted,
                    restoreTarget,
                    restoreForeground: !background));
            return Task.FromResult(result);
        }

        try
        {
            var options = _options.CurrentValue;
            var commandForEnvelope = IsListPlayersCommand(command) ? "ListPlayers" : command;
            var useClipboardForCommand = IsClipboardPasteInputMode(options.Console.CommandInputMode);
            var shouldUseClipboard = expectClipboard || useClipboardForCommand;
            var clipboardBaselineSequence = 0u;
            var gameTarget = timing.Measure(
                "gameLookup",
                () => _executionTargets.ResolveGameTarget(restoreTarget, background));
            if (!gameTarget.Ok || gameTarget.Target is null)
            {
                var result = ConsoleExecutionResult.Failure(
                    gameTarget.ErrorCode ?? "GAME_NOT_RUNNING",
                    gameTarget.ErrorMessage ?? "No configured Chivalry 2 process is running.",
                    requestId,
                    StatusForError(gameTarget.ErrorCode));
                return await CompleteAsync(result).ConfigureAwait(false);
            }

            if (shouldUseClipboard)
            {
                var setCommandClipboard = await timing.MeasureAsync(
                    "commandClipboard",
                    () => _clipboard.SetTextAsync(command, cancellationToken)).ConfigureAwait(false);
                if (!setCommandClipboard.Ok)
                {
                    var result = ConsoleExecutionResult.Failure(setCommandClipboard.ErrorCode!, setCommandClipboard.ErrorMessage!, requestId, StatusForError(setCommandClipboard.ErrorCode));
                    return await CompleteAsync(result).ConfigureAwait(false);
                }

                clipboardBaselineSequence = _clipboard.GetSequenceNumber();
            }

            var focus = await timing.MeasureAsync(
                "focusGame",
                () => _foreground.FocusAndVerifyAsync(
                    gameTarget.Target.WindowHandle,
                    options.Timing,
                    cancellationToken,
                    requestId)).ConfigureAwait(false);
            if (!focus.Ok)
            {
                var result = ConsoleExecutionResult.Failure(focus.ErrorCode!, focus.ErrorMessage!, requestId, StatusForError(focus.ErrorCode));
                return await CompleteAsync(result).ConfigureAwait(false);
            }

            await DelayIfPositiveAsync(options.Timing.AfterFocusDelayMs, cancellationToken).ConfigureAwait(false);

            var openConsole = await timing.MeasureAsync(
                "openConsole",
                () => _sendInput.SendConsoleOpenSequenceAsync(
                    options.Console,
                    options.Timing,
                    consoleOpenAttempt,
                    cancellationToken)).ConfigureAwait(false);
            if (!openConsole.Ok)
            {
                var result = ConsoleExecutionResult.Failure(openConsole.ErrorCode!, openConsole.ErrorMessage!, requestId, StatusForError(openConsole.ErrorCode));
                return await CompleteAsync(result).ConfigureAwait(false);
            }

            await DelayIfPositiveAsync(options.Timing.ConsoleOpenDelayMs, cancellationToken).ConfigureAwait(false);

            OperationResult sendText;
            if (useClipboardForCommand)
            {
                sendText = await timing.MeasureAsync(
                    "sendText",
                    () => _sendInput.PressPasteAsync(options.Timing, cancellationToken)).ConfigureAwait(false);
            }
            else
            {
                sendText = await timing.MeasureAsync(
                    "sendText",
                    () => _sendInput.SendUnicodeTextAsync(command, options.Timing, cancellationToken)).ConfigureAwait(false);
            }

            if (!sendText.Ok)
            {
                var result = ConsoleExecutionResult.Failure(sendText.ErrorCode!, sendText.ErrorMessage!, requestId, StatusForError(sendText.ErrorCode));
                return await CompleteAsync(result).ConfigureAwait(false);
            }

            await DelayIfPositiveAsync(options.Timing.BeforeEnterDelayMs, cancellationToken).ConfigureAwait(false);

            var enter = await timing.MeasureAsync(
                "enter",
                () => _sendInput.PressEnterAsync(
                    options.Timing,
                    consoleOpenAttempt,
                    cancellationToken)).ConfigureAwait(false);
            if (!enter.Ok)
            {
                var result = ConsoleExecutionResult.Failure(enter.ErrorCode!, enter.ErrorMessage!, requestId, StatusForError(enter.ErrorCode));
                return await CompleteAsync(result).ConfigureAwait(false);
            }

            LogConsoleCommandSent(requestId, commandForEnvelope, expectClipboard);

            ConsoleExecutionResult commandResult;
            if (expectClipboard)
            {
                var clipboard = await timing.MeasureAsync(
                    "clipboardWait",
                    () => ReadClipboardResultAfterChangeAsync(
                        command,
                        clipboardBaselineSequence,
                        options,
                        cancellationToken)).ConfigureAwait(false);
                if (!clipboard.Ok)
                {
                    var result = ConsoleExecutionResult.Failure(clipboard.ErrorCode!, clipboard.ErrorMessage!, requestId, StatusForError(clipboard.ErrorCode));
                    return await CompleteAsync(result).ConfigureAwait(false);
                }

                commandResult = timing.Measure(
                    "parse",
                    () => BuildClipboardSuccess(requestId, commandForEnvelope, command, clipboard.Text!));
            }
            else
            {
                commandResult = ConsoleExecutionResult.Success(requestId, commandForEnvelope, new { sent = true });
            }

            await DelayIfPositiveAsync(options.Timing.AfterCommandDelayMs, CancellationToken.None).ConfigureAwait(false);
            return await CompleteAsync(commandResult).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            var result = ConsoleExecutionResult.Failure("COMMAND_TIMEOUT", "Console command execution timed out.", requestId, StatusCodes.Status504GatewayTimeout);
            return await CompleteAsync(result).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            var result = ConsoleExecutionResult.Failure(
                "INPUT_FAILED",
                $"Console command execution failed: {ex.Message}",
                requestId,
                StatusCodes.Status500InternalServerError);
            return await CompleteAsync(result).ConfigureAwait(false);
        }
    }

    private async Task<ClipboardPollResult> ReadClipboardResultAfterChangeAsync(string command, uint baselineSequence, CoreHostOptions options, CancellationToken cancellationToken)
    {
        var isListPlayers = IsListPlayersCommand(command);
        var deadline = DateTimeOffset.UtcNow.AddMilliseconds(Math.Max(1, options.Timing.ClipboardChangeTimeoutMs));
        var pollIntervalMs = Math.Max(1, options.Timing.ClipboardSequencePollIntervalMs);
        var lastSeenSequence = baselineSequence;

        do
        {
            cancellationToken.ThrowIfCancellationRequested();
            var currentSequence = _clipboard.GetSequenceNumber();
            if (baselineSequence != 0 && currentSequence == lastSeenSequence)
            {
                await DelayIfPositiveAsync(pollIntervalMs, cancellationToken).ConfigureAwait(false);
                continue;
            }

            lastSeenSequence = currentSequence;

            var read = await _clipboard.ReadTextAsync(cancellationToken).ConfigureAwait(false);
            if (!read.Ok)
            {
                return ClipboardPollResult.Failure(read.ErrorCode!, read.ErrorMessage!);
            }

            if (read.HasText && IsAcceptedClipboardResult(read.Text!, command, isListPlayers))
            {
                return ClipboardPollResult.Success(read.Text!);
            }
        }
        while (DateTimeOffset.UtcNow < deadline);

        return ClipboardPollResult.Failure("CLIPBOARD_TIMEOUT", $"No valid clipboard output was captured within {options.Timing.ClipboardChangeTimeoutMs} ms after the command was sent.");
    }

    private bool IsAcceptedClipboardResult(string text, string command, bool isListPlayers)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return false;
        }

        if (string.Equals(text.Trim(), command.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return !isListPlayers || _listPlayersParser.LooksLikeListPlayersOutput(text);
    }

    private ConsoleExecutionResult BuildClipboardSuccess(string requestId, string commandForEnvelope, string originalCommand, string clipboardText)
    {
        if (!IsListPlayersCommand(originalCommand))
        {
            return ConsoleExecutionResult.Success(requestId, commandForEnvelope, new { sent = true, rawText = clipboardText });
        }

        var parsed = _listPlayersParser.Parse(clipboardText);
        Volatile.Write(ref _lastListPlayers, new LastListPlayersSummary(DateTimeOffset.UtcNow, parsed.ServerName, parsed.Players.Count));

        var warnings = new List<string>();
        if (parsed.ParseWarnings.Count > 0)
        {
            warnings.Add("LISTPLAYERS_PARSE_PARTIAL");
            warnings.AddRange(parsed.ParseWarnings);
        }

        return ConsoleExecutionResult.Success(requestId, "ListPlayers", parsed, warnings);
    }

    private static bool IsListPlayersCommand(string command)
    {
        return command.Equals("ListPlayers", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsClipboardPasteInputMode(string inputMode)
    {
        return inputMode.Equals("ClipboardPaste", StringComparison.OrdinalIgnoreCase) ||
            inputMode.Equals("Paste", StringComparison.OrdinalIgnoreCase);
    }

    private static void LogConsoleCommandSent(string requestId, string command, bool expectClipboard)
    {
        var previousColor = Console.ForegroundColor;
        try
        {
            Console.ForegroundColor = ConsoleColor.Cyan;
            Console.WriteLine($"[core-command] sent requestId={requestId} expectClipboard={expectClipboard} command=\"{command}\"");
        }
        finally
        {
            Console.ForegroundColor = previousColor;
        }
    }

    private static async Task DelayIfPositiveAsync(int delayMs, CancellationToken cancellationToken)
    {
        if (delayMs > 0)
        {
            await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
        }
    }

    private static ConsoleExecutionResult RestoreTargetFailure(
        RestoreTargetValidationResult validation,
        string requestId)
    {
        var errorCode = validation.ErrorCode ?? "INVALID_RESTORE_TARGET";
        return ConsoleExecutionResult.Failure(
            errorCode,
            validation.ErrorMessage ?? "The restore target is invalid.",
            requestId,
            StatusForError(errorCode));
    }

    private static bool HasRestorationWarning(ConsoleExecutionResult result)
    {
        return result.Warnings.Any(warning =>
            warning is "RESTORE_TARGET_LOST" or "FOREGROUND_RESTORE_FAILED");
    }

    private static async Task<IReadOnlyList<string>> CompleteSessionAsync(
        string requestId,
        ConsoleExecutionResult result,
        Func<Task<ConsoleExecutionResult>> cleanup)
    {
        try
        {
            var completed = await cleanup().ConfigureAwait(false);
            var warnings = completed.Warnings.Except(result.Warnings).ToArray();
            if (warnings.Length > 0)
            {
                Console.WriteLine($"[core-command-cleanup] requestId={requestId} warnings=\"{string.Join(',', warnings)}\"");
            }

            return warnings;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[core-command-cleanup] requestId={requestId} error=\"{ex.Message}\"");
            return ["INPUT_FAILED"];
        }
    }

    private static int StatusForError(string? code)
    {
        return code switch
        {
            "UNAUTHORIZED" => StatusCodes.Status401Unauthorized,
            "FORBIDDEN_CAPABILITY" or "PROCESS_NOT_ALLOWED" => StatusCodes.Status403Forbidden,
            "GAME_NOT_RUNNING" => StatusCodes.Status404NotFound,
            "MULTIPLE_GAMES_FOUND" or "WINDOW_NOT_FOUND" or "FOCUS_FAILED" or "FOREGROUND_VERIFY_FAILED" or "INPUT_BLOCKED" or "INPUT_FAILED" or "RESTORE_TARGET_INACTIVE" => StatusCodes.Status409Conflict,
            "COMMAND_TIMEOUT" or "CLIPBOARD_TIMEOUT" or "CLIPBOARD_NOT_READY" => StatusCodes.Status504GatewayTimeout,
            "CLIPBOARD_UNAVAILABLE" => StatusCodes.Status503ServiceUnavailable,
            _ => StatusCodes.Status400BadRequest
        };
    }

    private sealed record ClipboardPollResult(bool Ok, string? Text, string? ErrorCode, string? ErrorMessage)
    {
        public static ClipboardPollResult Success(string text)
        {
            return new ClipboardPollResult(true, text, null, null);
        }

        public static ClipboardPollResult Failure(string code, string message)
        {
            return new ClipboardPollResult(false, null, code, message);
        }
    }

    private sealed record InFlightListPlayers(
        ValidatedRestoreTarget Target,
        bool Background,
        bool RequireIdle,
        Task<ConsoleExecutionResult> Task);

    private sealed record CachedListPlayersResult(
        ValidatedRestoreTarget Target,
        bool Background,
        bool RequireIdle,
        DateTimeOffset TimestampUtc,
        ConsoleExecutionResult Result);
}
