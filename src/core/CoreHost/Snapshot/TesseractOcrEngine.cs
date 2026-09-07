using System.Drawing;
using System.Drawing.Imaging;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;
using TesseractOCR;
using TesseractOCR.Enums;

namespace CoreHost.Snapshot;

/// <summary>
/// Reads text with Tesseract. It tolerates the speckled background left by the levels curve far
/// better than the Windows engine, which returns nothing once the crop contains white noise.
/// </summary>
public sealed class TesseractOcrEngine : ISnapshotOcrEngine, IDisposable
{
    private readonly IOptionsMonitor<CoreHostOptions> _options;
    private readonly SemaphoreSlim _engineLock = new(1, 1);
    private Engine? _engine;

    public TesseractOcrEngine(IOptionsMonitor<CoreHostOptions> options)
    {
        _options = options;
    }

    public async Task<SnapshotOcrResult> ReadLinesAsync(Bitmap image, CancellationToken cancellationToken)
    {
        var engine = await ResolveEngineAsync(cancellationToken).ConfigureAwait(false);

        if (engine is null)
        {
            return SnapshotOcrResult.Failure("OCR_UNAVAILABLE", $"No Tesseract training data found in {ResolveDataPath()}.");
        }

        try
        {
            using var stream = new MemoryStream();
            image.Save(stream, System.Drawing.Imaging.ImageFormat.Png);
            stream.Position = 0;

            using var pix = TesseractOCR.Pix.Image.LoadFromMemory(stream);
            using var page = engine.Process(pix, ResolveSegmentation());

            var lines = page.Text
                .Split('\n', StringSplitOptions.RemoveEmptyEntries)
                .Select(line => line.Trim())
                .Where(line => line.Length > 0)
                .ToArray();

            return SnapshotOcrResult.Success(lines);
        }
        catch (Exception exception)
        {
            return SnapshotOcrResult.Failure("OCR_FAILED", exception.Message);
        }
    }

    public void Dispose()
    {
        _engine?.Dispose();
        _engineLock.Dispose();
    }

    private PageSegMode ResolveSegmentation()
    {
        return Enum.TryParse<PageSegMode>(_options.CurrentValue.Snapshot.TesseractPageSegmentation, true, out var mode)
            ? mode
            : PageSegMode.SingleBlock;
    }

    private string ResolveDataPath()
    {
        var configured = _options.CurrentValue.Snapshot.TesseractDataPath;

        return string.IsNullOrWhiteSpace(configured)
            ? Path.Combine(AppContext.BaseDirectory, "tessdata")
            : configured;
    }

    private async Task<Engine?> ResolveEngineAsync(CancellationToken cancellationToken)
    {
        if (_engine is not null)
        {
            return _engine;
        }

        await _engineLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            var path = ResolveDataPath();

            if (!File.Exists(Path.Combine(path, "eng.traineddata")))
            {
                return null;
            }

            _engine ??= new Engine(path, Language.English, EngineMode.Default);
            return _engine;
        }
        catch (Exception)
        {
            return null;
        }
        finally
        {
            _engineLock.Release();
        }
    }
}
