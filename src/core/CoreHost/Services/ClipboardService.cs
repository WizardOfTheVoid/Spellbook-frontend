using System.Runtime.InteropServices;
using System.Text;
using CoreHost.Models;
using CoreHost.Win32;

namespace CoreHost.Services;

public interface IClipboardService
{
    uint GetSequenceNumber();
    Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken);
    Task<OperationResult> SetTextAsync(string text, CancellationToken cancellationToken, uint? expectedSequence = null);
}

public sealed class TextCopyClipboardService : IClipboardService
{
    private readonly ClipboardService guardedRestore = new();

    public uint GetSequenceNumber() => guardedRestore.GetSequenceNumber();

    public async Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            var text = await TextCopy.ClipboardService.GetTextAsync(cancellationToken);
            return string.IsNullOrEmpty(text) ? ClipboardTextResult.NoText() : ClipboardTextResult.TextValue(text);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error) { return ClipboardTextResult.Failure("CLIPBOARD_UNAVAILABLE", $"Windows clipboard text could not be read: {error.Message}"); }
    }

    public async Task<OperationResult> SetTextAsync(string text, CancellationToken cancellationToken, uint? expectedSequence = null)
    {
        if (expectedSequence is not null)
            return await guardedRestore.SetTextAsync(text, cancellationToken, expectedSequence);

        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            await TextCopy.ClipboardService.SetTextAsync(text, cancellationToken);
            return OperationResult.Success();
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error) { return OperationResult.Failure("CLIPBOARD_UNAVAILABLE", $"Windows clipboard text could not be written: {error.Message}"); }
    }
}

public sealed class ClipboardService : IClipboardService
{
    private const int MaxAttempts = 50;
    private readonly IClipboardNativeApi native;
    private readonly TimeProvider clock;
    public ClipboardService() : this(new ClipboardNativeApi()) { }
    internal ClipboardService(IClipboardNativeApi native, TimeProvider? clock = null)
    {
        this.native = native;
        this.clock = clock ?? TimeProvider.System;
    }
    public uint GetSequenceNumber() => native.sequence();
    public async Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken)
    {
        try
        {
            return await withClipboard(native.read, cancellationToken);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error) { return ClipboardTextResult.Failure("CLIPBOARD_UNAVAILABLE", $"Windows clipboard text could not be read: {error.Message}"); }
    }
    public async Task<OperationResult> SetTextAsync(string text, CancellationToken cancellationToken, uint? expectedSequence = null)
    {
        try
        {
            return await withClipboard(() =>
            {
                if (expectedSequence is { } expected && native.sequence() != expected)
                    return OperationResult.Failure("CLIPBOARD_CHANGED", "The clipboard changed before the update could be applied.");
                native.write(text);
                return OperationResult.Success();
            }, cancellationToken);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception error) { return OperationResult.Failure("CLIPBOARD_UNAVAILABLE", $"Windows clipboard text could not be written: {error.Message}"); }
    }
    private async Task<T> withClipboard<T>(Func<T> operation, CancellationToken token)
    {
        for (var attempt = 1; ; attempt++)
        {
            token.ThrowIfCancellationRequested();
            try
            {
                if (!native.open()) throw new InvalidOperationException("Could not open clipboard.");
                try { token.ThrowIfCancellationRequested(); return operation(); }
                finally { native.close(); }
            }
            catch (Exception error) when (attempt < MaxAttempts && error is ExternalException or InvalidOperationException)
            { await Task.Delay(TimeSpan.FromMilliseconds(Math.Min(5 * attempt, 50)), clock, token); }
        }
    }
}

internal interface IClipboardNativeApi
{
    uint sequence();
    bool open();
    void close();
    ClipboardTextResult read();
    void write(string text);
}

internal sealed class ClipboardNativeApi : IClipboardNativeApi
{
    public uint sequence() => NativeMethods.GetClipboardSequenceNumber();
    public bool open() => NativeMethods.OpenClipboard(IntPtr.Zero);
    public void close() => NativeMethods.CloseClipboard();
    public ClipboardTextResult read()
    {
        if (!NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_UNICODETEXT)) return ClipboardTextResult.NoText();
        var dataHandle = NativeMethods.GetClipboardData(NativeMethods.CF_UNICODETEXT);
        if (dataHandle == IntPtr.Zero)
        {
            return ClipboardTextResult.NoText();
        }

        var lockedMemory = NativeMethods.GlobalLock(dataHandle);
        if (lockedMemory == IntPtr.Zero)
        {
            throw new InvalidOperationException($"Could not lock clipboard text memory. Win32 error: {Marshal.GetLastWin32Error()}.");
        }

        try
        {
            var text = Marshal.PtrToStringUni(lockedMemory);
            return string.IsNullOrEmpty(text)
                ? ClipboardTextResult.NoText()
                : ClipboardTextResult.TextValue(text);
        }
        finally
        {
            NativeMethods.GlobalUnlock(dataHandle);
        }

    }
    public void write(string text)
    {
        IntPtr memoryHandle = IntPtr.Zero;

        try
        {
            if (!NativeMethods.EmptyClipboard())
            {
                throw new InvalidOperationException($"Could not empty clipboard. Win32 error: {Marshal.GetLastWin32Error()}.");
            }

            var bytes = Encoding.Unicode.GetBytes(text + '\0');
            memoryHandle = NativeMethods.GlobalAlloc(NativeMethods.GMEM_MOVEABLE, (UIntPtr)bytes.Length);
            if (memoryHandle == IntPtr.Zero)
            {
                throw new InvalidOperationException($"Could not allocate clipboard memory. Win32 error: {Marshal.GetLastWin32Error()}.");
            }

            var lockedMemory = NativeMethods.GlobalLock(memoryHandle);
            if (lockedMemory == IntPtr.Zero)
            {
                throw new InvalidOperationException($"Could not lock clipboard memory. Win32 error: {Marshal.GetLastWin32Error()}.");
            }

            Marshal.Copy(bytes, 0, lockedMemory, bytes.Length);

            if (!NativeMethods.GlobalUnlock(memoryHandle) && Marshal.GetLastWin32Error() != 0)
            {
                throw new InvalidOperationException($"Could not unlock clipboard memory. Win32 error: {Marshal.GetLastWin32Error()}.");
            }

            if (NativeMethods.SetClipboardData(NativeMethods.CF_UNICODETEXT, memoryHandle) == IntPtr.Zero)
            {
                throw new InvalidOperationException($"Could not set clipboard text. Win32 error: {Marshal.GetLastWin32Error()}.");
            }

            memoryHandle = IntPtr.Zero;
            return;
        }
        finally
        {
            if (memoryHandle != IntPtr.Zero)
            {
                NativeMethods.GlobalFree(memoryHandle);
            }

        }
    }
}
