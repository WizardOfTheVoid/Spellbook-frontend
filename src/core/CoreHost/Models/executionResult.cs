using Microsoft.AspNetCore.Http;

namespace CoreHost.Models;

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
