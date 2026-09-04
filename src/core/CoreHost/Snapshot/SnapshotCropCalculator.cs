using System.Drawing;
using CoreHost.Options;

namespace CoreHost.Snapshot;

/// <summary>
/// Resolves the capture rectangle and upscale factor. Sizes are percentages of the game window and
/// the crop is normalised to a fixed output height, so 1080p and 4K hand OCR the same glyph size.
/// </summary>
public static class SnapshotCropCalculator
{
    public static Rectangle Resolve(SnapshotOptions options, int windowWidth, int windowHeight)
    {
        var width = Scale(windowWidth, options.CropWidthPercent);
        var height = Scale(windowHeight, options.CropHeightPercent);
        var maxX = windowWidth - width;
        var maxY = windowHeight - height;
        var (anchorX, anchorY) = Anchor(options.CropAnchor, maxX, maxY);
        var offsetX = Offset(windowWidth, options.CropOffsetXPercent);
        var offsetY = Offset(windowHeight, options.CropOffsetYPercent);

        return new Rectangle(
            Math.Clamp(anchorX + offsetX, 0, maxX),
            Math.Clamp(anchorY + offsetY, 0, maxY),
            width,
            height);
    }

    public static double ResolveScale(SnapshotOptions options, int cropHeight)
    {
        if (cropHeight <= 0)
        {
            return 1;
        }

        var maximum = Math.Max(1, options.MaxScaleFactor);
        return Math.Clamp((double)options.TargetHeight / cropHeight, 1, maximum);
    }

    private static int Scale(int total, double percent)
    {
        return Math.Clamp((int)Math.Round(total * Math.Clamp(percent, 0.1, 100) / 100), 1, total);
    }

    private static int Offset(int total, double percent)
    {
        return (int)Math.Round(total * Math.Clamp(percent, -100, 100) / 100);
    }

    // Accepts values such as Center, BottomCenter, TopLeft, or CenterRight; anything else centers.
    private static (int X, int Y) Anchor(string anchor, int maxX, int maxY)
    {
        var normalized = (anchor ?? string.Empty).Replace("-", string.Empty).Replace("_", string.Empty).Trim().ToLowerInvariant();

        var y = normalized.StartsWith("top") ? 0
            : normalized.StartsWith("bottom") ? maxY
            : maxY / 2;

        var x = normalized.EndsWith("left") ? 0
            : normalized.EndsWith("right") ? maxX
            : maxX / 2;

        return (x, y);
    }
}
