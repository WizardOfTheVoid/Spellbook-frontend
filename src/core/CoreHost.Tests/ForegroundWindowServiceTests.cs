using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;

namespace CoreHost.Tests;

public sealed class ForegroundWindowServiceTests
{
    private const int SwRestore = 9;
    private static readonly IntPtr TargetWindow = new(0x1234);
    private static readonly IntPtr OtherWindow = new(0x5678);

    [Fact]
    public async Task RestoreSucceedsImmediatelyWhenTargetIsAlreadyForeground()
    {
        var (windowApi, service) = CreateSubject();
        windowApi.ForegroundWindowHandle = TargetWindow;

        var result = await service.RestoreAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None);

        AssertSuccess(result);
        Assert.DoesNotContain(nameof(FakeWindowApi.SetForegroundWindow), windowApi.Calls);
    }

    [Fact]
    public async Task RestoreRetriesAfterInitialForegroundRequestFails()
    {
        var (windowApi, service) = CreateSubject();
        windowApi.SetForegroundWindowResults.Enqueue(false);
        windowApi.SetForegroundWindowResults.Enqueue(true);
        windowApi.UpdateForegroundWindowOnSuccess = true;

        var result = await service.RestoreAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None);

        AssertSuccess(result);
        Assert.Equal(2, CountCalls(windowApi, nameof(FakeWindowApi.SetForegroundWindow)));
    }

    [Fact]
    public async Task SuccessfulForegroundRequestSkipsBringWindowToTop()
    {
        var (windowApi, service) = CreateSubject();
        windowApi.UpdateForegroundWindowOnSuccess = true;

        var result = await service.RestoreAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None);

        AssertSuccess(result);
        Assert.DoesNotContain(nameof(FakeWindowApi.BringWindowToTop), windowApi.Calls);
    }

    [Fact]
    public async Task RestoreTimingReportsNativeStagesAndAttemptCount()
    {
        var (windowApi, service) = CreateSubject();
        var timingLines = new List<string>();
        windowApi.SetForegroundWindowResults.Enqueue(false);
        windowApi.SetForegroundWindowResults.Enqueue(true);
        windowApi.UpdateForegroundWindowOnSuccess = true;

        var result = await service.RestoreAndVerifyAsync(
            TargetWindow,
            ShortTiming(),
            CancellationToken.None,
            requestId: "request-1",
            timingLines.Add);

        AssertSuccess(result);
        var timingLine = Assert.Single(timingLines);
        Assert.StartsWith("[core-focus-timing] requestId=request-1 leg=restore-overlay", timingLine);
        Assert.Contains(" alreadyForeground=false attempts=2 requestAccepted=true verified=true ", timingLine);
        Assert.Contains("threadLookup=", timingLine);
        Assert.Contains("attach=", timingLine);
        Assert.Contains("bring=", timingLine);
        Assert.Contains("set=", timingLine);
        Assert.Contains("detach=", timingLine);
        Assert.Contains("pollWait=", timingLine);
        Assert.EndsWith("ms", timingLine);
    }

    [Fact]
    public async Task RestoreFailsWhenRequestSucceedsWithoutForegroundMatch()
    {
        var (windowApi, service) = CreateSubject();
        windowApi.SetForegroundWindowResult = true;

        var result = await service.RestoreAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None);

        AssertFailure(result, "FOREGROUND_RESTORE_FAILED");
        Assert.True(CountCalls(windowApi, nameof(FakeWindowApi.SetForegroundWindow)) > 1);
    }

    [Fact]
    public async Task RestoreReturnsForegroundRestoreFailedAfterRepeatedRequestFailures()
    {
        var (windowApi, service) = CreateSubject();
        windowApi.SetForegroundWindowResult = false;

        var result = await service.RestoreAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None);

        AssertFailure(result, "FOREGROUND_RESTORE_FAILED");
        Assert.True(CountCalls(windowApi, nameof(FakeWindowApi.SetForegroundWindow)) > 1);
    }

    [Fact]
    public async Task RestoreShowsMinimizedTargetBeforeRequestingForeground()
    {
        var (windowApi, service) = CreateSubject();
        windowApi.IsIconicResult = true;
        windowApi.UpdateForegroundWindowOnSuccess = true;

        var result = await service.RestoreAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None);

        AssertSuccess(result);
        Assert.Equal([(TargetWindow, SwRestore)], windowApi.ShowWindowCalls);
    }

    [Theory]
    [InlineData(false, "FOCUS_FAILED")]
    [InlineData(true, "FOREGROUND_VERIFY_FAILED")]
    public async Task GameFocusRetainsRequestAndVerificationErrors(bool requestResult, string errorCode)
    {
        var (windowApi, service) = CreateSubject();
        windowApi.SetForegroundWindowResult = requestResult;

        var result = await service.FocusAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None);

        AssertFailure(result, errorCode);
    }

    [Fact]
    public async Task ForegroundRequestDetachesEveryAttachedInputThreadWhenNativeRequestThrows()
    {
        const uint targetThreadId = 42;
        const uint foregroundThreadId = 84;
        var (windowApi, service) = CreateSubject();
        windowApi.WindowThreadIds[TargetWindow] = targetThreadId;
        windowApi.WindowThreadIds[OtherWindow] = foregroundThreadId;
        windowApi.SetForegroundWindowException = new InvalidOperationException("Native request failed");

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.RestoreAndVerifyAsync(TargetWindow, ShortTiming(), CancellationToken.None));

        Assert.Equal(
        [
            (windowApi.CurrentThreadId, targetThreadId, true),
            (windowApi.CurrentThreadId, foregroundThreadId, true),
            (windowApi.CurrentThreadId, foregroundThreadId, false),
            (windowApi.CurrentThreadId, targetThreadId, false)
        ],
        windowApi.AttachThreadInputCalls);
    }

    private static (FakeWindowApi WindowApi, ForegroundWindowService Service) CreateSubject()
    {
        var windowApi = new FakeWindowApi
        {
            ForegroundWindowHandle = OtherWindow
        };

        return (windowApi, new ForegroundWindowService(windowApi));
    }

    private static TimingOptions ShortTiming()
    {
        return new TimingOptions
        {
            FocusTimeoutMs = 20,
            RestoreFocusDelayMs = 0
        };
    }

    private static int CountCalls(FakeWindowApi windowApi, string call)
    {
        return windowApi.Calls.Count(candidate => candidate == call);
    }

    private static void AssertSuccess(CoreHost.Models.OperationResult result)
    {
        Assert.True(result.Ok);
        Assert.Null(result.ErrorCode);
        Assert.Null(result.ErrorMessage);
    }

    private static void AssertFailure(CoreHost.Models.OperationResult result, string errorCode)
    {
        Assert.False(result.Ok);
        Assert.Equal(errorCode, result.ErrorCode);
        Assert.NotNull(result.ErrorMessage);
    }
}
