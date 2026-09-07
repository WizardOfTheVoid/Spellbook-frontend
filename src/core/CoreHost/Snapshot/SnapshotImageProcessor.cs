using System.Drawing;
using System.Drawing.Imaging;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Snapshot;

/// <summary>
/// Applies a levels curve to the crop before OCR. Nameplate text sits near white, so lifting the
/// black point crushes the scene behind it while leaving the glyphs intact.
/// </summary>
public sealed class SnapshotImageProcessor
{
    private readonly IOptionsMonitor<CoreHostOptions> _options;

    public SnapshotImageProcessor(IOptionsMonitor<CoreHostOptions> options)
    {
        _options = options;
    }

    public Bitmap Process(Bitmap source)
    {
        var options = _options.CurrentValue.Snapshot;

        return options.LevelsEnabled
            ? Apply(source, BuildCurve(options))
            : new Bitmap(source);
    }

    private static byte[] BuildCurve(SnapshotOptions options)
    {
        var black = Math.Clamp(options.LevelsBlackPoint, 0, 254);
        var white = Math.Clamp(options.LevelsWhitePoint, black + 1, 255);
        var exponent = 1 / Math.Clamp(options.LevelsGamma, 0.1, 10);
        var range = white - black;
        var curve = new byte[256];

        for (var i = 0; i < curve.Length; i++)
        {
            var normalized = Math.Clamp((i - black) / (double)range, 0, 1);
            var value = (byte)Math.Clamp((int)(Math.Pow(normalized, exponent) * 255), 0, 255);
            curve[i] = options.LevelsInvert ? (byte)(255 - value) : value;
        }

        return curve;
    }

    private static Bitmap Apply(Bitmap source, byte[] curve)
    {
        var width = source.Width;
        var height = source.Height;
        var target = new Bitmap(width, height, PixelFormat.Format24bppRgb);
        var bounds = new Rectangle(0, 0, width, height);
        var read = source.LockBits(bounds, ImageLockMode.ReadOnly, PixelFormat.Format24bppRgb);
        var write = target.LockBits(bounds, ImageLockMode.WriteOnly, PixelFormat.Format24bppRgb);

        try
        {
            unsafe
            {
                for (var y = 0; y < height; y++)
                {
                    var readRow = (byte*)read.Scan0 + (y * read.Stride);
                    var writeRow = (byte*)write.Scan0 + (y * write.Stride);

                    for (var x = 0; x < width; x++)
                    {
                        var offset = x * 3;
                        var luma = (int)((readRow[offset + 2] * 0.299) + (readRow[offset + 1] * 0.587) + (readRow[offset] * 0.114));
                        var value = curve[Math.Clamp(luma, 0, 255)];

                        writeRow[offset] = value;
                        writeRow[offset + 1] = value;
                        writeRow[offset + 2] = value;
                    }
                }
            }
        }
        finally
        {
            source.UnlockBits(read);
            target.UnlockBits(write);
        }

        return target;
    }
}
