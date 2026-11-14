using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Snapshot;

public sealed class SnapshotCaptureService(GameProcessService processes, GameWindowCapture capture)
{
    public ConsoleExecutionResult CaptureImage(string requestId)
    {
        var lookup = processes.GetTargetProcess();
        if (!lookup.Success || lookup.Process is null)
            return ConsoleExecutionResult.Failure(lookup.ErrorCode ?? "GAME_NOT_RUNNING", lookup.ErrorMessage ?? "Chivalry 2 is not running", requestId);

        var result = capture.Capture(lookup.Process.WindowHandle);
        if (!result.Ok || result.Image is null)
            return ConsoleExecutionResult.Failure(result.ErrorCode!, result.ErrorMessage!, requestId);

        using var image = result.Image;
        using var prepared = SnapshotVisionImage.Prepare(image);
        using var stream = new MemoryStream();
        prepared.Save(stream, System.Drawing.Imaging.ImageFormat.Png);

        return ConsoleExecutionResult.Success(requestId, null, new
        {
            imageBase64 = Convert.ToBase64String(stream.ToArray()),
            width = prepared.Width,
            height = prepared.Height,
            region = result.Region
        });
    }
}
