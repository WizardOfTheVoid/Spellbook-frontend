using System.Drawing;
using System.Drawing.Imaging;
using CoreHost.Options;
using Microsoft.Extensions.Options;
using Timer = System.Threading.Timer;

namespace CoreHost.Snapshot;

/// <summary>
/// Writes the last snapshot capture to a temp folder so the crop can be inspected by hand.
/// Files are overwritten on every capture and removed again after the retention window.
/// </summary>
public sealed class SnapshotDebugWriter : IDisposable
{
    private const string OriginalFileName = "snapshot-original.png";
    private const string CroppedFileName = "snapshot-crop.png";
    private const string ProcessedFileName = "snapshot-crop-processed.png";

    private readonly IOptionsMonitor<CoreHostOptions> _options;
    private readonly object _lock = new();
    private Timer? _cleanupTimer;
    private string _folder = string.Empty;

    public SnapshotDebugWriter(IOptionsMonitor<CoreHostOptions> options)
    {
        _options = options;
    }

    public string? Write(Bitmap original, Bitmap cropped, Bitmap processed)
    {
        var options = _options.CurrentValue.Snapshot;

        if (!options.SaveDebugImages)
        {
            return null;
        }

        var folder = ResolveFolder(options);

        lock (_lock)
        {
            try
            {
                Directory.CreateDirectory(folder);
                original.Save(Path.Combine(folder, OriginalFileName), ImageFormat.Png);
                cropped.Save(Path.Combine(folder, CroppedFileName), ImageFormat.Png);
                processed.Save(Path.Combine(folder, ProcessedFileName), ImageFormat.Png);
            }
            catch (Exception)
            {
                return null;
            }

            ScheduleCleanup(folder, Math.Max(1, options.DebugRetentionSeconds));
            return folder;
        }
    }

    public void Dispose()
    {
        _cleanupTimer?.Dispose();
    }

    private static string ResolveFolder(SnapshotOptions options)
    {
        // Resolves to src/core/temp from the dev build output, matching how Program.cs locates .env.
        return string.IsNullOrWhiteSpace(options.DebugFolder)
            ? Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "temp"))
            : options.DebugFolder;
    }

    private void ScheduleCleanup(string folder, int retentionSeconds)
    {
        _folder = folder;
        _cleanupTimer ??= new Timer(_ => Cleanup(), null, Timeout.InfiniteTimeSpan, Timeout.InfiniteTimeSpan);
        _cleanupTimer.Change(TimeSpan.FromSeconds(retentionSeconds), Timeout.InfiniteTimeSpan);
    }

    private void Cleanup()
    {
        lock (_lock)
        {
            foreach (var fileName in new[] { OriginalFileName, CroppedFileName, ProcessedFileName })
            {
                try
                {
                    File.Delete(Path.Combine(_folder, fileName));
                }
                catch (Exception)
                {
                    // A locked preview file just stays until the next capture overwrites it.
                }
            }
        }
    }
}
