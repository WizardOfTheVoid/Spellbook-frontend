using Microsoft.AspNetCore.Http;

namespace CoreHost.Models;

public sealed record ApiError(string Code, string Message);

public sealed record ApiEnvelope<T>
{
    public bool Ok { get; init; }

    public string? RequestId { get; init; }

    public DateTimeOffset TimestampUtc { get; init; } = DateTimeOffset.UtcNow;

    public string? Command { get; init; }

    public T? Data { get; init; }

    public ApiError? Error { get; init; }

    public IReadOnlyList<string>? Warnings { get; init; }
}

public static class ApiResult
{
    public static IResult Success<T>(string? requestId, string? command, T data, IReadOnlyList<string>? warnings = null)
    {
        var envelope = new ApiEnvelope<T>
        {
            Ok = true,
            RequestId = requestId,
            Command = command,
            Data = data,
            Warnings = EmptyToNull(warnings)
        };

        return Results.Json(envelope);
    }

    public static IResult Failure(string code, string message, string? requestId = null, int statusCode = StatusCodes.Status400BadRequest)
    {
        return Results.Json(FailureEnvelope(code, message, requestId), statusCode: statusCode);
    }

    public static ApiEnvelope<object?> FailureEnvelope(
        string code,
        string message,
        string? requestId = null,
        IReadOnlyList<string>? warnings = null,
        object? data = null)
    {
        return new ApiEnvelope<object?>
        {
            Ok = false,
            RequestId = requestId,
            Data = data,
            Error = new ApiError(code, message),
            Warnings = EmptyToNull(warnings)
        };
    }

    public static IResult FromExecution(ConsoleExecutionResult result)
    {
        if (!result.Ok)
        {
            var failureEnvelope = FailureEnvelope(
                result.ErrorCode ?? "INVALID_REQUEST",
                result.ErrorMessage ?? "Request failed.",
                result.RequestId,
                result.Warnings,
                result.Data);
            return Results.Json(failureEnvelope, statusCode: result.StatusCode);
        }

        var envelope = new ApiEnvelope<object?>
        {
            Ok = true,
            RequestId = result.RequestId,
            Command = result.Command,
            Data = result.Data,
            Warnings = EmptyToNull(result.Warnings)
        };

        return Results.Json(envelope);
    }

    private static IReadOnlyList<string>? EmptyToNull(IReadOnlyList<string>? warnings)
    {
        return warnings is { Count: > 0 } ? warnings : null;
    }
}
