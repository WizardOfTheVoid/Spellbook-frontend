using System.Text.Json.Serialization;

namespace CoreHost.Models;

public sealed record BinaryInfo(string? FileVersion, string? ProductVersion, string? Sha256);

public sealed record GameProcessInfo(
    [property: JsonIgnore] IntPtr WindowHandle,
    int Id,
    string Name,
    string? Path,
    bool? IsX64,
    string MainWindowHandle,
    string? MainWindowTitle,
    BinaryInfo? Binary);

public sealed record GameProcessLookupResult(
    bool Success,
    string? ErrorCode,
    string? ErrorMessage,
    GameProcessInfo? Process,
    IReadOnlyList<GameProcessInfo> Matches)
{
    public static GameProcessLookupResult Found(GameProcessInfo process, IReadOnlyList<GameProcessInfo> matches)
    {
        return new GameProcessLookupResult(true, null, null, process, matches);
    }

    public static GameProcessLookupResult Failure(string code, string message, IReadOnlyList<GameProcessInfo>? matches = null)
    {
        return new GameProcessLookupResult(false, code, message, null, matches ?? []);
    }
}
