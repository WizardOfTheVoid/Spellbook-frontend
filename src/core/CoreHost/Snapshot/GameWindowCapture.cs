using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
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
    private readonly SnapshotImageProcessor _processor;

    public GameWindowCapture(IOptionsMonitor<CoreHostOptions> options, SnapshotDebugWriter debugWriter, SnapshotImageProcessor processor)
    {
        _options = options;
        _debugWriter = debugWriter;
        _processor = processor;
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
        var scale = SnapshotCropCalculator.ResolveScale(options, source.Height);

        try
        {
            var captureWatch = Stopwatch.StartNew();
            using var window = CopyScreen(rect.Left, rect.Top, width, height);
            captureWatch.Stop();
            SnapshotLog.Write("Create screenshot", $"{width}x{height} window at ({rect.Left},{rect.Top})", captureWatch.ElapsedMilliseconds);

            var cropWatch = Stopwatch.StartNew();
            using var cropped = CropAndScale(window, source, scale);
            cropWatch.Stop();
            SnapshotLog.Write(
                "Crop screenshot",
                $"{source.Width}x{source.Height} at screen ({region.X},{region.Y}), anchor {options.CropAnchor} " +
                $"({options.CropWidthPercent}% x {options.CropHeightPercent}%, offset {options.CropOffsetXPercent}%,{options.CropOffsetYPercent}%)",
                cropWatch.ElapsedMilliseconds);
            SnapshotLog.Write("Scale screenshot", $"{scale:0.##}x to {cropped.Width}x{cropped.Height}, target height {options.TargetHeight}");

            var processWatch = Stopwatch.StartNew();
            var processed = _processor.Process(cropped);
            processWatch.Stop();
            SnapshotLog.Write(
                "Process screenshot",
                options.LevelsEnabled
                    ? $"levels black {options.LevelsBlackPoint}, white {options.LevelsWhitePoint}, gamma {options.LevelsGamma}"
                    : "levels disabled",
                processWatch.ElapsedMilliseconds);

            var debugWatch = Stopwatch.StartNew();
            var debugFolder = _debugWriter.Write(window, cropped, processed);
            debugWatch.Stop();

            if (debugFolder is not null)
            {
                SnapshotLog.Write("Save debug images", debugFolder, debugWatch.ElapsedMilliseconds);
            }

            return SnapshotCaptureResult.Success(processed, region);
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

    private static Bitmap CropAndScale(Bitmap window, Rectangle source, double scale)
    {
        var cropped = new Bitmap(
            (int)Math.Round(source.Width * scale),
            (int)Math.Round(source.Height * scale),
            PixelFormat.Format24bppRgb);

        using (var graphics = Graphics.FromImage(cropped))
        {
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.DrawImage(window, new Rectangle(0, 0, cropped.Width, cropped.Height), source, GraphicsUnit.Pixel);
        }

        return cropped;
    }
}
