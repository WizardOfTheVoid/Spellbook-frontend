using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;
using Microsoft.Extensions.Options;

namespace CoreHost.Tests;

public sealed class ConsoleBatchRuntimeTests
{
    private static readonly ValidatedRestoreTarget GameTarget = new(55, new IntPtr(0x5678));

    [Fact]
    public async Task BackgroundFocusUsesTheValidatedLeaseTargetWithoutAnotherGameLookup()
    {
        var process = new GameProcessInfo(
            GameTarget.WindowHandle,
            GameTarget.ProcessId,
            "Chivalry2-Win64-Shipping.exe",
            null,
            true,
            "0x0000000000005678",
            "Chivalry 2",
            null);
        var locator = new FakeGameProcessTargetLocator(
            GameProcessLookupResult.Found(process, [process]));
        var windowApi = new FakeWindowApi
        {
            OwnerProcessId = unchecked((uint)GameTarget.ProcessId),
            ForegroundWindowHandle = new IntPtr(0x1234),
            UpdateForegroundWindowOnSuccess = true
        };
        var options = new StaticOptionsMonitor(new CoreHostOptions
        {
            Timing = new TimingOptions { FocusTimeoutMs = 20 }
        });
        var foreground = new ForegroundWindowService(windowApi);
        var resolver = new ConsoleExecutionTargetResolver(
            locator,
            new RestoreTargetValidator(windowApi));
        var sendInput = new SendInputService(new FakeKeyboardInputApi());
        var runtime = new ConsoleBatchRuntime(
            options,
            resolver,
            foreground,
            sendInput,
            new ConsoleCommandCleanupService(
                options,
                sendInput,
                new RestoreTargetValidator(windowApi),
                foreground),
            new FakeClipboardService());
        var resolved = resolver.Resolve(null, background: true);

        var result = await runtime.FocusGameAsync(
            Assert.IsType<ValidatedRestoreTarget>(resolved.Target),
            background: true,
            CancellationToken.None);

        Assert.True(result.Ok);
        Assert.Equal(GameTarget.WindowHandle, windowApi.ForegroundWindowHandle);
        Assert.Equal(1, locator.Calls);
    }

    private sealed class FakeGameProcessTargetLocator(GameProcessLookupResult result)
        : IGameProcessTargetLocator
    {
        public int Calls { get; private set; }

        public GameProcessLookupResult GetTargetProcess()
        {
            Calls++;
            return result;
        }
    }

    private sealed class FakeClipboardService : IClipboardService
    {
        public uint GetSequenceNumber() => 0;

        public Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken)
        {
            return Task.FromResult(ClipboardTextResult.NoText());
        }

        public Task<OperationResult> SetTextAsync(
            string text,
            CancellationToken cancellationToken)
        {
            return Task.FromResult(OperationResult.Success());
        }
    }

    private sealed class StaticOptionsMonitor(CoreHostOptions options)
        : IOptionsMonitor<CoreHostOptions>
    {
        public CoreHostOptions CurrentValue => options;

        public CoreHostOptions Get(string? name) => options;

        public IDisposable? OnChange(Action<CoreHostOptions, string?> listener) => null;
    }
}
