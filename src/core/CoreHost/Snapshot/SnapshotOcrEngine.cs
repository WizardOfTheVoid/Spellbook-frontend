using System.Drawing;
using System.Drawing.Imaging;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;
using Windows.Globalization;
using Windows.Graphics.Imaging;
using Windows.Media.Ocr;
using Windows.Storage.Streams;

namespace CoreHost.Snapshot;

/// <summary>
/// Wraps the Windows built-in OCR engine so snapshot text extraction needs no external models.
/// </summary>
public sealed class SnapshotOcrEngine : ISnapshotOcrEngine
{
    private readonly IOptionsMonitor<CoreHostOptions> _options;
    private readonly SemaphoreSlim _engineLock = new(1, 1);
    private OcrEngine? _engine;

    public SnapshotOcrEngine(IOptionsMonitor<CoreHostOptions> options)
    {
        _options = options;
    }

    public async Task<SnapshotOcrResult> ReadLinesAsync(Bitmap image, CancellationToken cancellationToken)
    {
        var engine = await ResolveEngineAsync(cancellationToken).ConfigureAwait(false);

        if (engine is null)
        {
            return SnapshotOcrResult.Failure("OCR_UNAVAILABLE", "No Windows OCR language pack is installed for the configured language.");
        }

        try
        {
            using var softwareBitmap = await ToSoftwareBitmapAsync(image).ConfigureAwait(false);
            var recognized = await engine.RecognizeAsync(softwareBitmap).AsTask(cancellationToken).ConfigureAwait(false);
            var lines = recognized.Lines
                .Select(line => line.Text.Trim())
                .Where(text => text.Length > 0)
                .ToArray();

            return SnapshotOcrResult.Success(lines);
        }
        catch (Exception exception)
        {
            return SnapshotOcrResult.Failure("OCR_FAILED", exception.Message);
        }
    }

    private async Task<OcrEngine?> ResolveEngineAsync(CancellationToken cancellationToken)
    {
        if (_engine is not null)
        {
            return _engine;
        }

        await _engineLock.WaitAsync(cancellationToken).ConfigureAwait(false);

        try
        {
            var language = _options.CurrentValue.Snapshot.Language;
            _engine ??= OcrEngine.TryCreateFromLanguage(new Language(language)) ?? OcrEngine.TryCreateFromUserProfileLanguages();
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

    private static async Task<SoftwareBitmap> ToSoftwareBitmapAsync(Bitmap image)
    {
        using var stream = new InMemoryRandomAccessStream();

        // AsStreamForWrite hands ownership of `stream` to the adapter, so disposing it would close `stream`.
        var writeStream = stream.AsStreamForWrite();
        image.Save(writeStream, ImageFormat.Bmp);
        await writeStream.FlushAsync().ConfigureAwait(false);

        stream.Seek(0);
        var decoder = await BitmapDecoder.CreateAsync(stream);
        return await decoder.GetSoftwareBitmapAsync();
    }
}
