using System.Runtime.InteropServices;
using CoreHost.Models;
using CoreHost.Win32;
using Microsoft.AspNetCore.Http;

namespace CoreHost.Services;

public interface IReadOnlyProcessMemoryReader
{
    NativeProcessMemoryReadResult ReadProbe(GameProcessInfo process);
}

public sealed class ReadOnlyProcessMemoryReader : IReadOnlyProcessMemoryReader
{
    private const string ProbeTarget = "PEB.BeingDebugged";

    public NativeProcessMemoryReadResult ReadProbe(GameProcessInfo target)
    {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitProcess)
        {
            return NativeProcessMemoryReadResult.Failure(
                "platform-check",
                "PLATFORM_NOT_SUPPORTED",
                "The read-only process memory probe requires 64-bit Windows.",
                StatusCodes.Status501NotImplemented);
        }

        var handle = NativeMethods.OpenProcess(
            NativeMethods.PROCESS_QUERY_LIMITED_INFORMATION | NativeMethods.PROCESS_VM_READ,
            false,
            target.Id);

        if (handle == IntPtr.Zero)
        {
            return OpenFailure(Marshal.GetLastWin32Error());
        }

        try
        {
            return ReadProbe(handle, target.Id);
        }
        finally
        {
            NativeMethods.CloseHandle(handle);
        }
    }

    private static NativeProcessMemoryReadResult ReadProbe(IntPtr handle, int expectedProcessId)
    {
        var status = NativeMethods.NtQueryInformationProcess(
            handle,
            informationClass: 0,
            out var processInformation,
            Marshal.SizeOf<NativeMethods.PROCESS_BASIC_INFORMATION>(),
            out _);

        if (status != 0)
        {
            var nativeStatus = $"0x{unchecked((uint)status):X8}";
            return NativeProcessMemoryReadResult.Failure(
                "process-query",
                "PROCESS_QUERY_FAILED",
                "Windows did not return basic information for the game process.",
                StatusCodes.Status409Conflict,
                nativeStatus: nativeStatus);
        }

        if (processInformation.UniqueProcessId.ToInt64() != expectedProcessId ||
            processInformation.PebBaseAddress == IntPtr.Zero)
        {
            return NativeProcessMemoryReadResult.Failure(
                "process-validate",
                "GAME_PROCESS_CHANGED",
                "The read-only handle no longer identifies the validated game process.",
                StatusCodes.Status409Conflict);
        }

        var address = IntPtr.Add(processInformation.PebBaseAddress, 2);
        var addressText = $"0x{address.ToInt64():X16}";
        var buffer = new byte[1];
        if (!NativeMethods.ReadProcessMemory(
                handle,
                address,
                buffer,
                new UIntPtr((uint)buffer.Length),
                out var bytesRead))
        {
            return ReadFailure(Marshal.GetLastWin32Error(), addressText);
        }

        var readCount = checked((int)bytesRead.ToUInt64());
        if (readCount != buffer.Length)
        {
            return NativeProcessMemoryReadResult.Failure(
                "memory-read",
                "PROCESS_MEMORY_READ_FAILED",
                "The read-only process memory request returned an incomplete value.",
                StatusCodes.Status409Conflict,
                address: addressText,
                bytesRead: readCount,
                target: ProbeTarget);
        }

        return NativeProcessMemoryReadResult.Success(addressText, readCount, ProbeTarget, buffer[0]);
    }

    private static NativeProcessMemoryReadResult OpenFailure(int win32Error)
    {
        var accessDenied = win32Error == 5;
        return NativeProcessMemoryReadResult.Failure(
            "process-open",
            accessDenied ? "PROCESS_MEMORY_ACCESS_DENIED" : "PROCESS_MEMORY_OPEN_FAILED",
            accessDenied
                ? "Windows denied read-only access to the game process."
                : "The game process could not be opened for read-only memory access.",
            accessDenied ? StatusCodes.Status403Forbidden : StatusCodes.Status409Conflict,
            win32Error);
    }

    private static NativeProcessMemoryReadResult ReadFailure(int win32Error, string address)
    {
        var accessDenied = win32Error == 5;
        return NativeProcessMemoryReadResult.Failure(
            "memory-read",
            accessDenied ? "PROCESS_MEMORY_ACCESS_DENIED" : "PROCESS_MEMORY_READ_FAILED",
            accessDenied
                ? "Windows denied the read-only game process memory request."
                : "The read-only game process memory request failed.",
            accessDenied ? StatusCodes.Status403Forbidden : StatusCodes.Status409Conflict,
            win32Error,
            address: address,
            target: ProbeTarget);
    }
}
