using System.Drawing;

namespace CoreHost.Models;

public sealed record SnapshotRegion(int X, int Y, int Width, int Height);

public sealed record SnapshotCaptureResult(
    bool Ok,
    Bitmap? Image,
    SnapshotRegion? Region,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static SnapshotCaptureResult Success(Bitmap image, SnapshotRegion region)
    {
        return new SnapshotCaptureResult(true, image, region, null, null);
    }

    public static SnapshotCaptureResult Failure(string code, string message)
    {
        return new SnapshotCaptureResult(false, null, null, code, message);
    }
}

public sealed record SnapshotOcrResult(
    bool Ok,
    IReadOnlyList<string> Lines,
    string? ErrorCode,
    string? ErrorMessage)
{
    public static SnapshotOcrResult Success(IReadOnlyList<string> lines)
    {
        return new SnapshotOcrResult(true, lines, null, null);
    }

    public static SnapshotOcrResult Failure(string code, string message)
    {
        return new SnapshotOcrResult(false, [], code, message);
    }
}
