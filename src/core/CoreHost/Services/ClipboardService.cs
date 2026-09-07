using System.Runtime.InteropServices;
using System.Text;
using CoreHost.Models;
using CoreHost.Win32;

namespace CoreHost.Services;

public interface IClipboardService
{
    uint GetSequenceNumber();

    Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken);

    Task<OperationResult> SetTextAsync(string text, CancellationToken cancellationToken);
}

public sealed class ClipboardService : IClipboardService
{
    private const int MaxAttempts = 50;

    public uint GetSequenceNumber()
    {
        return NativeMethods.GetClipboardSequenceNumber();
    }

    public Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(ReadTextNative());
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return Task.FromResult(ClipboardTextResult.Failure("CLIPBOARD_UNAVAILABLE", $"Windows clipboard text could not be read: {ex.Message}"));
        }
    }

    public Task<OperationResult> SetTextAsync(string text, CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            WriteTextNative(text);

            return Task.FromResult(OperationResult.Success());
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return Task.FromResult(OperationResult.Failure("CLIPBOARD_UNAVAILABLE", $"Windows clipboard text could not be written: {ex.Message}"));
        }
    }

    private static ClipboardTextResult ReadTextNative()
    {
        return Retry(() =>
        {
            if (!NativeMethods.IsClipboardFormatAvailable(NativeMethods.CF_UNICODETEXT))
            {
                return ClipboardTextResult.NoText();
            }

            OpenClipboardWithRetry();
            try
            {
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
            finally
            {
                NativeMethods.CloseClipboard();
            }
        });
    }

    private static void WriteTextNative(string text)
    {
        Retry(() =>
        {
            OpenClipboardWithRetry();
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
                return true;
            }
            finally
            {
                if (memoryHandle != IntPtr.Zero)
                {
                    NativeMethods.GlobalFree(memoryHandle);
                }

                NativeMethods.CloseClipboard();
            }
        });
    }

    private static void OpenClipboardWithRetry()
    {
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            if (NativeMethods.OpenClipboard(IntPtr.Zero))
            {
                return;
            }

            Thread.Sleep(Math.Min(5 * attempt, 50));
        }

        throw new InvalidOperationException($"Could not open clipboard. Win32 error: {Marshal.GetLastWin32Error()}.");
    }

    private static T Retry<T>(Func<T> action)
    {
        Exception? lastException = null;

        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                return action();
            }
            catch (Exception ex) when (IsTransientClipboardException(ex) && attempt < MaxAttempts)
            {
                lastException = ex;
                Thread.Sleep(Math.Min(5 * attempt, 50));
            }
            catch (Exception ex) when (IsTransientClipboardException(ex))
            {
                lastException = ex;
            }
        }

        throw lastException ?? new InvalidOperationException("Clipboard operation failed.");
    }

    private static bool IsTransientClipboardException(Exception ex)
    {
        return ex is ExternalException or InvalidOperationException;
    }
}
