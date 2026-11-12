using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Clipboard;

public sealed class CommandClipboard(IClipboardService clipboard)
{
    private ClipboardTextResult? original;
    private uint ownedSequence;
    private bool ownsClipboard;
    public uint baseline { get; private set; }

    public async Task write(string command, bool preserve, CancellationToken token)
    {
        original = null;
        ownsClipboard = false;
        if (preserve)
        {
            original = await clipboard.ReadTextAsync(token);
            if (!original.Ok) throw new InvalidOperationException(original.ErrorMessage);
        }
        var result = await clipboard.SetTextAsync(command, token);
        if (!result.Ok) throw new InvalidOperationException(result.ErrorMessage);
        baseline = ownedSequence = clipboard.GetSequenceNumber();
        ownsClipboard = true;
    }

    public void verifyCommand()
    {
        if (!ownsClipboard || clipboard.GetSequenceNumber() != baseline)
            throw new ClipboardChangedException();
    }

    public async Task<string?> readChanged(Func<string, bool> accept, CancellationToken token)
    {
        var sequence = clipboard.GetSequenceNumber();
        if (sequence == baseline) return null;
        var result = await clipboard.ReadTextAsync(token);
        if (!result.Ok) throw new InvalidOperationException(result.ErrorMessage);
        if (!result.HasText || clipboard.GetSequenceNumber() != sequence || !accept(result.Text!)) return null;
        ownedSequence = sequence;
        return result.Text;
    }

    public async Task<string?> restore(CancellationToken token)
    {
        var saved = original;
        original = null;
        var owned = ownsClipboard;
        ownsClipboard = false;
        if (!owned || saved is null || clipboard.GetSequenceNumber() != ownedSequence) return null;
        var result = await clipboard.SetTextAsync(saved.Text ?? string.Empty, token, ownedSequence);
        if (result.ErrorCode == "CLIPBOARD_CHANGED") return null;
        return result.Ok ? null : result.ErrorCode ?? "CLIPBOARD_RESTORE_FAILED";
    }
}

public sealed class ClipboardChangedException() : Exception("Clipboard changed before the Command could be submitted.");
