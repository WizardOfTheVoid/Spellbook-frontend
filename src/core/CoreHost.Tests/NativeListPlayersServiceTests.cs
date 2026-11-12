using CoreHost.Models;
using CoreHost.Services;
using Microsoft.AspNetCore.Http;

namespace CoreHost.Tests;

public sealed class NativeListPlayersServiceTests
{
    [Fact]
    public void ExecuteReturnsPartialDiagnosticAfterReadingProcessMemory()
    {
        var process = CreateProcess();
        var reader = new FakeReadOnlyProcessMemoryReader(
            NativeProcessMemoryReadResult.Success(
                "0x000000564D9A0002",
                1,
                "PEB.BeingDebugged",
                0));
        var service = new NativeListPlayersService(
            new FakeGameProcessLocator(GameProcessLookupResult.Found(process, [process])),
            reader);

        var result = service.Execute("native-listplayers-test");

        Assert.True(result.Ok);
        Assert.Equal("native-listplayers-test", result.RequestId);
        Assert.Null(result.Command);
        Assert.Equal(StatusCodes.Status200OK, result.StatusCode);
        var data = Assert.IsType<NativeListPlayersProbeData>(result.Data);
        Assert.Equal("external-read-only-memory", data.Method);
        Assert.Equal("memory-read", data.Stage);
        Assert.Same(process, data.Process);
        Assert.Equal("0x000000564D9A0002", data.Memory.Address);
        Assert.Equal(1, data.Memory.BytesRead);
        Assert.Equal("PEB.BeingDebugged", data.Memory.Target);
        Assert.Equal(0, data.Memory.Value);
        Assert.Equal("not-attempted", data.Identity.Status);
        Assert.Same(process, reader.ReceivedProcess);
        Assert.Single(result.Warnings);
    }

    [Fact]
    public void ExecuteReportsVmReadDenialAtMemoryReadStage()
    {
        var process = CreateProcess();
        var reader = new FakeReadOnlyProcessMemoryReader(
            NativeProcessMemoryReadResult.Failure(
                "memory-read",
                "PROCESS_MEMORY_ACCESS_DENIED",
                "Windows denied the read-only game process memory request.",
                StatusCodes.Status403Forbidden,
                win32Error: 5,
                address: "0x000000564D9A0002",
                target: "PEB.BeingDebugged"));
        var service = new NativeListPlayersService(
            new FakeGameProcessLocator(GameProcessLookupResult.Found(process, [process])),
            reader);

        var result = service.Execute("native-listplayers-test");

        Assert.False(result.Ok);
        Assert.Equal("PROCESS_MEMORY_ACCESS_DENIED", result.ErrorCode);
        Assert.Equal(StatusCodes.Status403Forbidden, result.StatusCode);
        var data = Assert.IsType<NativeListPlayersProbeData>(result.Data);
        Assert.Equal("memory-read", data.Stage);
        Assert.Equal(5, data.Memory.Win32Error);
        Assert.Equal("not-attempted", data.Identity.Status);
    }

    [Fact]
    public void ExecuteStopsBeforeMemoryAccessWhenGameIsNotRunning()
    {
        var reader = new FakeReadOnlyProcessMemoryReader(
            NativeProcessMemoryReadResult.Success("0x000000564D9A0002", 1, "PEB.BeingDebugged", 0));
        var service = new NativeListPlayersService(
            new FakeGameProcessLocator(GameProcessLookupResult.Failure("GAME_NOT_RUNNING", "Game is not running.")),
            reader);

        var result = service.Execute("native-listplayers-test");

        Assert.False(result.Ok);
        Assert.Equal("GAME_NOT_RUNNING", result.ErrorCode);
        Assert.Equal(StatusCodes.Status404NotFound, result.StatusCode);
        Assert.Null(reader.ReceivedProcess);
    }

    private static GameProcessInfo CreateProcess()
    {
        return new GameProcessInfo(
            new IntPtr(123),
            456,
            "Chivalry2-Win64-Shipping.exe",
            @"C:\Games\TBL\Binaries\Win64\Chivalry2-Win64-Shipping.exe",
            true,
            "0x000000000000007B",
            "Chivalry 2",
            new BinaryInfo("1.0.0", "1.0.0", null));
    }

    private sealed class FakeGameProcessLocator(GameProcessLookupResult result) : INativeGameProcessLocator
    {
        public GameProcessLookupResult GetReadOnlyTargetProcess()
        {
            return result;
        }
    }

    private sealed class FakeReadOnlyProcessMemoryReader(NativeProcessMemoryReadResult result) : IReadOnlyProcessMemoryReader
    {
        public GameProcessInfo? ReceivedProcess { get; private set; }

        public NativeProcessMemoryReadResult ReadProbe(GameProcessInfo process)
        {
            ReceivedProcess = process;
            return result;
        }
    }
}
