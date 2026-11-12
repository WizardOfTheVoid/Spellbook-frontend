using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Win32;
using Microsoft.Extensions.Options;

namespace CoreHost.Snapshot;

/// <summary>
/// Copies the bottom strip of the game window off the screen without focusing or altering it.
/// </summary>
public sealed class GameWindowCapture
{
    private readonly IOptionsMonitor<CoreHostOptions> _options;
    private readonly SnapshotDebugWriter _debugWriter;

    public GameWindowCapture(IOptionsMonitor<CoreHostOptions> options, SnapshotDebugWriter debugWriter)
    {
        _options = options;
        _debugWriter = debugWriter;
    }

    public SnapshotCaptureResult Capture(IntPtr windowHandle)
    {
        if (windowHandle == IntPtr.Zero || !NativeMethods.GetWindowRect(windowHandle, out var rect))
        {
            return SnapshotCaptureResult.Failure("WINDOW_NOT_CAPTURABLE", "Could not read the game window bounds.");
        }

        var options = _options.CurrentValue.Snapshot;
        var width = rect.Right - rect.Left;
        var height = rect.Bottom - rect.Top;

        if (width <= 0 || height <= 0)
        {
            return SnapshotCaptureResult.Failure("WINDOW_NOT_CAPTURABLE", "The game window has no visible area.");
        }

        var source = SnapshotCropCalculator.Resolve(options, width, height);
        var region = new SnapshotRegion(rect.Left + source.X, rect.Top + source.Y, source.Width, source.Height);

        try
        {
            var captureWatch = Stopwatch.StartNew();
            using var window = CopyScreen(rect.Left, rect.Top, width, height);
            captureWatch.Stop();
            SnapshotLog.Write("Create screenshot", $"{width}x{height} window at ({rect.Left},{rect.Top})", captureWatch.ElapsedMilliseconds);

            var cropWatch = Stopwatch.StartNew();
            using var cropped = window.Clone(source, PixelFormat.Format24bppRgb);
            cropWatch.Stop();
            SnapshotLog.Write(
                "Crop screenshot",
                $"{source.Width}x{source.Height} at screen ({region.X},{region.Y}), anchor {options.CropAnchor} " +
                $"({options.CropWidthPercent}% x {options.CropHeightPercent}%, offset {options.CropOffsetXPercent}%,{options.CropOffsetYPercent}%)",
                cropWatch.ElapsedMilliseconds);

            var debugWatch = Stopwatch.StartNew();
            var debugFolder = _debugWriter.Write(window, cropped);
            debugWatch.Stop();

            if (debugFolder is not null)
            {
                SnapshotLog.Write("Save debug images", debugFolder, debugWatch.ElapsedMilliseconds);
            }

            return SnapshotCaptureResult.Success(new Bitmap(cropped), region);
        }
        catch (Exception exception)
        {
            return SnapshotCaptureResult.Failure("SNAPSHOT_CAPTURE_FAILED", exception.Message);
        }
    }

    // 24bpp drops the alpha channel; CopyFromScreen can leave a 32bppArgb buffer fully transparent.
    private static Bitmap CopyScreen(int x, int y, int width, int height)
    {
        var bitmap = new Bitmap(width, height, PixelFormat.Format24bppRgb);

        using (var graphics = Graphics.FromImage(bitmap))
        {
            graphics.CopyFromScreen(x, y, 0, 0, new Size(width, height), CopyPixelOperation.SourceCopy);
        }

        return bitmap;
    }

}
