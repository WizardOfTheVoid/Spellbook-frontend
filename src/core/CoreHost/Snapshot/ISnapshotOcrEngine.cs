using System.Drawing;
using CoreHost.Models;

namespace CoreHost.Snapshot;

/// <summary>
/// Extracts text lines from a prepared snapshot crop.
/// </summary>
public interface ISnapshotOcrEngine
{
    Task<SnapshotOcrResult> ReadLinesAsync(Bitmap image, CancellationToken cancellationToken);
}
