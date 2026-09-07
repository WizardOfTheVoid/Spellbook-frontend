using CoreHost.Models;

namespace CoreHost.Services;

public sealed class NativeListPlayersService
{
    private const string IdentityReason = "The PlayerState address chain is not configured, so no identity data was read.";
    private readonly INativeGameProcessLocator _gameProcessLocator;
    private readonly IReadOnlyProcessMemoryReader _memoryReader;

    public NativeListPlayersService(
        INativeGameProcessLocator gameProcessLocator,
        IReadOnlyProcessMemoryReader memoryReader)
    {
        _gameProcessLocator = gameProcessLocator;
        _memoryReader = memoryReader;
    }

    public ConsoleExecutionResult Execute(string? id)
    {
        if (!RequestValidators.TryNormalizeRequestId(id, out var requestId, out var errorMessage))
        {
            return ConsoleExecutionResult.Failure("INVALID_REQUEST", errorMessage!, id);
        }

        var lookup = _gameProcessLocator.GetReadOnlyTargetProcess();
        if (!lookup.Success || lookup.Process is null)
        {
            return ConsoleExecutionResult.Failure(
                lookup.ErrorCode ?? "GAME_NOT_RUNNING",
                lookup.ErrorMessage ?? "No configured Chivalry 2 process is running.",
                requestId,
                StatusForLookupError(lookup.ErrorCode));
        }

        var read = _memoryReader.ReadProbe(lookup.Process);
        var data = new NativeListPlayersProbeData(
            "external-read-only-memory",
            read.Stage,
            lookup.Process,
            new NativeMemoryProbeData(
                read.Address,
                read.BytesRead,
                read.Target,
                read.Value,
                read.Win32Error,
                read.NativeStatus),
            new NativeIdentityProbeData("not-attempted", IdentityReason));

        if (!read.Ok)
        {
            return ConsoleExecutionResult.Failure(
                read.ErrorCode ?? "PROCESS_MEMORY_READ_FAILED",
                read.ErrorMessage ?? "The read-only process memory probe failed.",
                requestId,
                read.StatusCode,
                data: data);
        }

        return ConsoleExecutionResult.Success(requestId, null, data, [IdentityReason]);
    }

    private static int StatusForLookupError(string? code)
    {
        return code switch
        {
            "PROCESS_NOT_ALLOWED" => StatusCodes.Status403Forbidden,
            "GAME_NOT_RUNNING" => StatusCodes.Status404NotFound,
            "MULTIPLE_GAMES_FOUND" or "WINDOW_NOT_FOUND" or "PROCESS_ARCH_MISMATCH" => StatusCodes.Status409Conflict,
            _ => StatusCodes.Status400BadRequest
        };
    }
}
