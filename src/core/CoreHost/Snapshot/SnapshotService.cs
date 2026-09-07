using System.Diagnostics;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using Microsoft.Extensions.Options;

namespace CoreHost.Snapshot;

/// <summary>
/// Runs the read-only snapshot pipeline: locate the game window, capture, OCR, release the image.
/// </summary>
public sealed class SnapshotService
{
    private readonly GameProcessService _gameProcessService;
    private readonly GameWindowCapture _capture;
    private readonly ISnapshotOcrEngine _ocrEngine;
    private readonly IOptionsMonitor<CoreHostOptions> _options;

    public SnapshotService(
        GameProcessService gameProcessService,
        GameWindowCapture capture,
        ISnapshotOcrEngine ocrEngine,
        IOptionsMonitor<CoreHostOptions> options)
    {
        _gameProcessService = gameProcessService;
        _capture = capture;
        _ocrEngine = ocrEngine;
        _options = options;
    }

    public async Task<ConsoleExecutionResult> CaptureTextAsync(string requestId, CancellationToken cancellationToken)
    {
        var options = _options.CurrentValue.Snapshot;
        SnapshotLog.Write("Start capture", $"requestId={requestId}");
        var lookup = _gameProcessService.GetTargetProcess();

        if (!lookup.Success || lookup.Process is null)
        {
            SnapshotLog.Write("Locate game window failed", lookup.ErrorCode ?? "GAME_NOT_RUNNING");

            return ConsoleExecutionResult.Failure(
                lookup.ErrorCode ?? "GAME_NOT_RUNNING",
                lookup.ErrorMessage ?? "No configured Chivalry 2 process is running.",
                requestId);
        }

        SnapshotLog.Write("Locate game window", $"handle={lookup.Process.WindowHandle}");

        var captured = _capture.Capture(lookup.Process.WindowHandle);

        if (!captured.Ok || captured.Image is null || captured.Region is null)
        {
            SnapshotLog.Write("Capture failed", captured.ErrorMessage ?? "Snapshot capture failed.");

            return ConsoleExecutionResult.Failure(
                captured.ErrorCode ?? "SNAPSHOT_CAPTURE_FAILED",
                captured.ErrorMessage ?? "Snapshot capture failed.",
                requestId);
        }

        SnapshotOcrResult ocr;
        var ocrWatch = Stopwatch.StartNew();

        using (captured.Image)
        {
            ocr = await _ocrEngine.ReadLinesAsync(captured.Image, cancellationToken).ConfigureAwait(false);
        }

        ocrWatch.Stop();

        if (!ocr.Ok)
        {
            SnapshotLog.Write("Run OCR failed", $"{ocr.ErrorCode} {ocr.ErrorMessage}", ocrWatch.ElapsedMilliseconds);
            return ConsoleExecutionResult.Failure(ocr.ErrorCode!, ocr.ErrorMessage!, requestId);
        }

        SnapshotLog.Write("Run OCR", $"{ocr.Lines.Count} line(s) recognized", ocrWatch.ElapsedMilliseconds);
        SnapshotLog.Write("Found text", ocr.Lines.Count > 0 ? string.Join(" | ", ocr.Lines) : "none");

        var data = new
        {
            hasText = ocr.Lines.Count > 0,
            text = string.Join("\n", ocr.Lines),
            lines = ocr.Lines,
            region = captured.Region,
            matching = new
            {
                fullConfidence = options.MatchFullConfidence,
                prefixLength = options.MatchPrefixLength,
                prefixConfidence = options.MatchPrefixConfidence,
                suffixLength = options.MatchSuffixLength,
                suffixConfidence = options.MatchSuffixConfidence,
                wordConfidence = options.MatchWordConfidence,
                maxSpaces = options.MatchMaxSpaces
            }
        };

        return ConsoleExecutionResult.Success(requestId, null, data);
    }
}
