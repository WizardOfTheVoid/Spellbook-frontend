using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;

namespace CoreHost.Models;

public sealed record RawConsoleCommandRequest(
    string? Id,
    string? Command,
    bool? ExpectClipboard,
    int? TimeoutMs,
    bool? RestoreClipboard,
    JsonElement? RestoreTarget);

public sealed record ListPlayersRequest(
    string? Id,
    int? TimeoutMs,
    JsonElement? RestoreTarget,
    bool? Background,
    bool? RequireIdle = null);

public sealed record SnapshotRequest(string? Id);

public sealed record NativeListPlayersRequest(string? Id);

public sealed record KeyPressRequest(
    string? Id,
    int? VirtualKey,
    int? DurationMs,
    JsonElement? RestoreTarget);

public sealed record KeySequenceRequest(
    string? Id,
    IReadOnlyList<KeySequenceEntry>? Presses,
    JsonElement? RestoreTarget,
    int? MinimumMovementIdleMs = null);

public sealed record KeySequenceEntry(
    int? VirtualKey,
    int? DurationMs);

public sealed record BanRequest(string? Id, string? PlayfabId, int? Hours, string? Reason, JsonElement? RestoreTarget);

public sealed record KickRequest(string? Id, string? PlayfabId, string? Reason, JsonElement? RestoreTarget);

public sealed record UnbanRequest(string? Id, string? PlayfabId, JsonElement? RestoreTarget);

public sealed record WarnRequest(string? Id, string? Message, JsonElement? RestoreTarget);

public sealed record ConsoleMessageRequest(
    string? Id,
    string? Kind,
    string? Message,
    JsonElement? RestoreTarget,
    bool? Background = null,
    bool? RequireIdle = null);

public sealed record ConsoleBatchRequest(
    string? Id,
    IReadOnlyList<ConsoleBatchCommandRequest>? Commands,
    JsonElement? RestoreTarget,
    bool? Background = null,
    bool? RequireIdle = null);

public sealed record ConsoleBatchCommandRequest(
    string? CommandType,
    string? PlayfabId,
    int? Hours,
    string? Message,
    int? DelayMs);

public sealed record PreparedConsoleCommand(string CommandType, string Command, int DelayMs);

public sealed record ConsoleBatchBuildResult(
    bool Ok,
    string? RequestId,
    IReadOnlyList<PreparedConsoleCommand>? Commands,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static ConsoleBatchBuildResult Success(string requestId, IReadOnlyList<PreparedConsoleCommand> commands)
    {
        return new ConsoleBatchBuildResult(true, requestId, commands, null, null);
    }

    public static ConsoleBatchBuildResult Failure(string code, string message, string? requestId = null)
    {
        return new ConsoleBatchBuildResult(false, requestId, null, code, message);
    }
}

public sealed record ConsoleExecutionResult(
    bool Ok,
    string? RequestId,
    string? Command,
    object? Data,
    string? ErrorCode,
    string? ErrorMessage,
    int StatusCode,
    IReadOnlyList<string> Warnings)
{
    public static ConsoleExecutionResult Success(string? requestId, string? command, object? data, IReadOnlyList<string>? warnings = null)
    {
        return new ConsoleExecutionResult(true, requestId, command, data, null, null, StatusCodes.Status200OK, warnings ?? []);
    }

    public static ConsoleExecutionResult Failure(
        string code,
        string message,
        string? requestId = null,
        int statusCode = StatusCodes.Status400BadRequest,
        IReadOnlyList<string>? warnings = null,
        object? data = null)
    {
        return new ConsoleExecutionResult(false, requestId, null, data, code, message, statusCode, warnings ?? []);
    }

    public ConsoleExecutionResult WithWarnings(IEnumerable<string> warnings)
    {
        var merged = Warnings.Concat(warnings).Where(warning => !string.IsNullOrWhiteSpace(warning)).Distinct(StringComparer.Ordinal).ToArray();
        return this with { Warnings = merged };
    }
}

public sealed record CommandBuildResult(bool Ok, string? RequestId, string? Command, string? ErrorCode, string? ErrorMessage)
{
    public static CommandBuildResult Success(string requestId, string command)
    {
        return new CommandBuildResult(true, requestId, command, null, null);
    }

    public static CommandBuildResult Failure(string code, string message, string? requestId = null)
    {
        return new CommandBuildResult(false, requestId, null, code, message);
    }
}

public static class RequestValidators
{
    public const int MaxRequestIdLength = 96;
    public const int MaxCommandLength = 512;
    public const int MaxQuotedTextLength = 180;

    private static readonly Regex RequestIdRegex = new("^[A-Za-z0-9_.:-]{1,96}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex PlayfabIdRegex = new("^[A-Za-z0-9_-]{4,128}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static bool TryNormalizeRequestId(string? id, out string requestId, out string? errorMessage)
    {
        requestId = string.IsNullOrWhiteSpace(id) ? Guid.NewGuid().ToString("N") : id.Trim();
        if (!RequestIdRegex.IsMatch(requestId))
        {
            errorMessage = "Request id must match ^[A-Za-z0-9_.:-]{1,96}$.";
            return false;
        }

        errorMessage = null;
        return true;
    }

    public static bool TryNormalizeCommand(string? command, out string normalized, out string? errorMessage)
    {
        normalized = command?.Trim() ?? string.Empty;
        if (normalized.Length == 0)
        {
            errorMessage = "Command is required.";
            return false;
        }

        if (normalized.Length > MaxCommandLength)
        {
            errorMessage = $"Command must be {MaxCommandLength} characters or fewer.";
            return false;
        }

        if (ContainsForbiddenLineCharacter(normalized))
        {
            errorMessage = "Command must be exactly one line and cannot contain CR, LF, or NUL.";
            return false;
        }

        errorMessage = null;
        return true;
    }

    public static bool TryNormalizePlayfabId(string? playfabId, out string normalized, out string? errorMessage)
    {
        normalized = playfabId?.Trim() ?? string.Empty;
        if (!PlayfabIdRegex.IsMatch(normalized))
        {
            errorMessage = "PlayFab id must match ^[A-Za-z0-9_-]{4,128}$.";
            return false;
        }

        errorMessage = null;
        return true;
    }

    public static bool ContainsForbiddenLineCharacter(string value)
    {
        return value.IndexOfAny(['\r', '\n', '\0']) >= 0;
    }
}
