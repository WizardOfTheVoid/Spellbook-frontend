using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using CoreHost.Options;
using CoreHost.Snapshot;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests;

/// <summary>
/// Guards the upscale factor the snapshot pipeline depends on: OCR returns nothing at all on
/// native-size in-game nameplate text and only becomes readable once upscaled.
/// </summary>
public class SnapshotOcrEngineTests
{
    private const string SampleText = "CAPITANOAN";

    [Fact]
    public async Task ReadsTheSampleNameplateAtTheDefaultScaleFactor()
    {
        using var sample = LoadSample();
        using var upscaled = Upscale(sample, DefaultScaleAt1080p());

        var result = await ReadAsync(upscaled);

        Assert.True(result.Ok, $"OCR failed: {result.ErrorCode} {result.ErrorMessage}");
        Assert.Contains(SampleText, string.Join(" ", result.Lines), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task ReadsNothingWithoutUpscaling()
    {
        using var sample = LoadSample();

        var result = await ReadAsync(sample);

        Assert.True(result.Ok, $"OCR failed: {result.ErrorCode} {result.ErrorMessage}");
        Assert.Empty(result.Lines);
    }

    private static async Task<Models.SnapshotOcrResult> ReadAsync(Bitmap image)
    {
        var engine = new SnapshotOcrEngine(new StaticOptionsMonitor(new CoreHostOptions()));
        return await engine.ReadLinesAsync(image, CancellationToken.None);
    }

    private static Bitmap LoadSample()
    {
        return new Bitmap(Path.Combine(AppContext.BaseDirectory, "TestData", "nameplate-sample.png"));
    }

    // The sample is a tight nameplate crop, so mirror the upscale a 1080p capture would apply.
    private static double DefaultScaleAt1080p()
    {
        var options = new CoreHostOptions().Snapshot;
        var crop = SnapshotCropCalculator.Resolve(options, 1920, 1080);

        return SnapshotCropCalculator.ResolveScale(options, crop.Height);
    }

    private static Bitmap Upscale(Bitmap source, double scale)
    {
        var copy = new Bitmap(
            (int)Math.Round(source.Width * scale),
            (int)Math.Round(source.Height * scale),
            PixelFormat.Format24bppRgb);

        using (var graphics = Graphics.FromImage(copy))
        {
            graphics.InterpolationMode = InterpolationMode.HighQualityBicubic;
            graphics.DrawImage(source, new Rectangle(0, 0, copy.Width, copy.Height));
        }

        return copy;
    }

    private sealed class StaticOptionsMonitor(CoreHostOptions options) : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue => options;

        public CoreHostOptions Get(string? name) => options;

        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
