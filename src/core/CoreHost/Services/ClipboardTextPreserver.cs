using CoreHost.Models;

namespace CoreHost.Services;

internal static class ClipboardTextPreserver
{
    public static async Task<ConsoleExecutionResult> ExecuteAsync(
        Func<CancellationToken, Task<ClipboardTextResult>> readTextAsync,
        Func<string, CancellationToken, Task<OperationResult>> setTextAsync,
        Func<Task<ConsoleExecutionResult>> executeAsync,
        CancellationToken cancellationToken,
        TimingLog? timing = null,
        bool restoreClipboard = true)
    {
        if (!restoreClipboard)
        {
            return await executeAsync().ConfigureAwait(false);
        }

        var originalClipboard = timing is null
            ? await readTextAsync(cancellationToken).ConfigureAwait(false)
            : await timing.MeasureAsync(
                "clipboardSave",
                () => readTextAsync(cancellationToken)).ConfigureAwait(false);
        var result = await executeAsync().ConfigureAwait(false);

        if (timing is null)
        {
            await setTextAsync(originalClipboard.Text ?? string.Empty, CancellationToken.None).ConfigureAwait(false);
        }
        else
        {
            await timing.MeasureAsync(
                "clipboardRestore",
                () => setTextAsync(originalClipboard.Text ?? string.Empty, CancellationToken.None)).ConfigureAwait(false);
        }

        return result;
    }
}
