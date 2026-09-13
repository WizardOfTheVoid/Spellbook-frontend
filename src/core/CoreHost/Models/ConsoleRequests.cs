using System.Text.RegularExpressions;

namespace CoreHost.Models;

public sealed record SnapshotRequest(string? Id);
public sealed record NativeListPlayersRequest(string? Id);
public sealed record KeySequenceEntry(int? VirtualKey, int? DurationMs);

public static class RequestValidators
{
    private static readonly Regex RequestIdRegex = new("^[A-Za-z0-9_.:-]{1,96}$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

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

}
