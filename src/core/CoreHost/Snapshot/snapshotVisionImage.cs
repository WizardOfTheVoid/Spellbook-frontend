using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;

namespace CoreHost.Snapshot;

public static class SnapshotVisionImage
{
    public static Bitmap Prepare(Bitmap source)
    {
        // Fit the detection service's image limits while preserving the crop's proportions.
        var scale = Math.Min(1, 1568d / Math.Max(source.Width, source.Height));
        var width = Math.Max(1, (int)Math.Round(source.Width * scale));
        var height = Math.Max(1, (int)Math.Round(source.Height * scale));
        var image = new Bitmap(Math.Max(280, width), Math.Max(280, height), PixelFormat.Format24bppRgb);
        using var graphics = Graphics.FromImage(image);
        graphics.Clear(Color.Black);
        graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
        graphics.DrawImage(source, new Rectangle((image.Width - width) / 2, (image.Height - height) / 2, width, height));
        return image;
    }
}
