using Microsoft.AspNetCore.Http;

namespace CoreHost.Models;

public sealed record NativeProcessMemoryReadResult(
    bool Ok,
    string Stage,
    string? Address,
    int BytesRead,
    string? Target,
    int? Value,
    int? Win32Error,
    string? NativeStatus,
    string? ErrorCode,
    string? ErrorMessage,
    int StatusCode)
{
    public static NativeProcessMemoryReadResult Success(
        string address,
        int bytesRead,
        string target,
        int value)
    {
        return new NativeProcessMemoryReadResult(
            true,
            "memory-read",
            address,
            bytesRead,
            target,
            value,
            null,
            null,
            null,
            null,
            StatusCodes.Status200OK);
    }

    public static NativeProcessMemoryReadResult Failure(
        string stage,
        string code,
        string message,
        int statusCode,
        int? win32Error = null,
        string? nativeStatus = null,
        string? address = null,
        int bytesRead = 0,
        string? target = null)
    {
        return new NativeProcessMemoryReadResult(
            false,
            stage,
            address,
            bytesRead,
            target,
            null,
            win32Error,
            nativeStatus,
            code,
            message,
            statusCode);
    }
}

public sealed record NativeMemoryProbeData(
    string? Address,
    int BytesRead,
    string? Target,
    int? Value,
    int? Win32Error,
    string? NativeStatus = null);

public sealed record NativeIdentityProbeData(string Status, string Reason);

public sealed record NativeListPlayersProbeData(
    string Method,
    string Stage,
    GameProcessInfo Process,
    NativeMemoryProbeData Memory,
    NativeIdentityProbeData Identity);
