namespace CoreHost.Snapshot;

/// <summary>
/// Writes one snapshot step per line as: [Core/Snapshot] (12ms) Action: context.
/// </summary>
internal static class SnapshotLog
{
    public static void Write(string action, string context, long? elapsedMs = null)
    {
        var timing = elapsedMs is null ? string.Empty : $"({elapsedMs}ms) ";
        Console.WriteLine($"[Core/Snapshot] {timing}{action}: {context}");
    }
}
