using System.Text.Json;
using CoreHost.Models;
using CoreHost.Services;
using CoreHost.Tests.Fakes;

namespace CoreHost.Tests;

public sealed class RestoreTargetValidatorTests
{
    private const int ProcessId = 4321;
    private static readonly IntPtr WindowHandle = new(0x1234);
    private static readonly JsonElement ValidRequest = CreateRequest(ProcessId, "0x0000000000001234");

    [Fact]
    public void ValidateRejectsMissingRequestBeforeNativeChecks()
    {
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate((JsonElement?)null);

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Theory]
    [InlineData("{\"processId\":\"4321\",\"windowHandle\":\"0x1234\"}")]
    [InlineData("{\"processId\":4321,\"windowHandle\":4660}")]
    [InlineData("{\"processId\":2147483648,\"windowHandle\":\"0x1234\"}")]
    public void MalformedJsonFieldTypesReachValidator(string restoreTargetJson)
    {
        var requestJson = $"{{\"id\":\"request-1\",\"command\":\"ListPlayers\",\"restoreTarget\":{restoreTargetJson}}}";
        var request = JsonSerializer.Deserialize<RawConsoleCommandRequest>(
            requestJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(request!.RestoreTarget);

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Theory]
    [InlineData("42")]
    [InlineData("\"x\"")]
    [InlineData("[]")]
    public void MalformedJsonContainersReachValidator(string restoreTargetJson)
    {
        var requestJson = $"{{\"id\":\"request-1\",\"command\":\"ListPlayers\",\"restoreTarget\":{restoreTargetJson}}}";
        var request = JsonSerializer.Deserialize<RawConsoleCommandRequest>(
            requestJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(request!.RestoreTarget);

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Fact]
    public void ValidJsonFieldShapeReachesValidator()
    {
        const string requestJson = "{\"id\":\"request-1\",\"command\":\"ListPlayers\",\"restoreTarget\":{\"processId\":4321,\"windowHandle\":\"0x0000000000001234\"}}";
        var request = JsonSerializer.Deserialize<RawConsoleCommandRequest>(
            requestJson,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(request!.RestoreTarget);

        AssertSuccess(result, new ValidatedRestoreTarget(ProcessId, WindowHandle));
        AssertValidationCalls(windowApi);
    }

    [Theory]
    [InlineData(null, "0x1234")]
    [InlineData(0, "0x1234")]
    [InlineData(-1, "0x1234")]
    [InlineData(4321, null)]
    [InlineData(4321, "")]
    [InlineData(4321, " ")]
    public void ValidateRejectsMissingRequiredValuesBeforeNativeChecks(int? processId, string? windowHandle)
    {
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(CreateRequest(processId, windowHandle));

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Theory]
    [InlineData("1234")]
    [InlineData("0X1234")]
    [InlineData("0x")]
    [InlineData("0x12G4")]
    [InlineData(" 0x1234")]
    [InlineData("0x1234 ")]
    public void ValidateRejectsMalformedHandleBeforeNativeChecks(string windowHandle)
    {
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(CreateRequest(ProcessId, windowHandle));

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Fact]
    public void ValidateRejectsOverSixteenDigitHandleBeforeNativeChecks()
    {
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(CreateRequest(ProcessId, "0x10000000000000000"));

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Fact]
    public void ValidateRejectsZeroHandleBeforeNativeChecks()
    {
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(CreateRequest(ProcessId, "0x0"));

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Fact]
    public void ValidateRejectsHandleOutsideThirtyTwoBitRangeBeforeNativeChecks()
    {
        if (IntPtr.Size != 4)
        {
            return;
        }

        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(CreateRequest(ProcessId, "0x100000000"));

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi);
    }

    [Fact]
    public void ValidateRejectsStaleWindowBeforeOwnershipChecks()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.WindowExists = false;

        var result = validator.Validate(ValidRequest);

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi, nameof(FakeWindowApi.IsWindow));
    }

    [Fact]
    public void ValidateRejectsWindowWithoutThreadBeforeActivityChecks()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.WindowThreadId = 0;

        var result = validator.Validate(ValidRequest);

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi,
            nameof(FakeWindowApi.IsWindow),
            nameof(FakeWindowApi.GetWindowThreadProcessId));
    }

    [Fact]
    public void ValidateRejectsPidMismatchBeforeActivityChecks()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.OwnerProcessId = ProcessId + 1;

        var result = validator.Validate(ValidRequest);

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi,
            nameof(FakeWindowApi.IsWindow),
            nameof(FakeWindowApi.GetWindowThreadProcessId));
    }

    [Fact]
    public void ValidateRejectsHiddenWindowBeforeForegroundCheck()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.WindowVisible = false;

        var result = validator.Validate(ValidRequest);

        AssertFailure(result, "RESTORE_TARGET_INACTIVE");
        AssertCalls(windowApi,
            nameof(FakeWindowApi.IsWindow),
            nameof(FakeWindowApi.GetWindowThreadProcessId),
            nameof(FakeWindowApi.IsWindowVisible));
    }

    [Fact]
    public void ValidateRejectsNonForegroundWindow()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.ForegroundWindowHandle = new IntPtr(0x5678);

        var result = validator.Validate(ValidRequest);

        AssertFailure(result, "RESTORE_TARGET_INACTIVE");
        AssertValidationCalls(windowApi);
    }

    [Fact]
    public void ResolveAcceptsOwnedVisibleTargetWhenItIsNotForeground()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.ForegroundWindowHandle = new IntPtr(0x5678);

        var result = validator.Resolve(ValidRequest);

        AssertSuccess(result, new ValidatedRestoreTarget(ProcessId, WindowHandle));
        AssertOwnershipCalls(windowApi);
    }

    [Fact]
    public void ValidateAcceptsValidTarget()
    {
        var (windowApi, validator) = CreateSubject();

        var result = validator.Validate(ValidRequest);

        AssertSuccess(result, new ValidatedRestoreTarget(ProcessId, WindowHandle));
        AssertValidationCalls(windowApi);
    }

    [Fact]
    public void ValidateValidatedTargetRepeatsNativeChecks()
    {
        var (windowApi, validator) = CreateSubject();
        var target = new ValidatedRestoreTarget(ProcessId, WindowHandle);

        var result = validator.Validate(target);

        AssertSuccess(result, target);
        AssertValidationCalls(windowApi);
    }

    [Fact]
    public void ValidateValidatedTargetRejectsStaleWindowBeforeOwnershipChecks()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.WindowExists = false;

        var result = validator.Validate(new ValidatedRestoreTarget(ProcessId, WindowHandle));

        AssertFailure(result, "INVALID_RESTORE_TARGET");
        AssertCalls(windowApi, nameof(FakeWindowApi.IsWindow));
    }

    [Fact]
    public void IsStillOwnedWindowRejectsStaleWindowBeforeOwnershipChecks()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.WindowExists = false;

        var result = validator.IsStillOwnedWindow(new ValidatedRestoreTarget(ProcessId, WindowHandle));

        Assert.False(result);
        AssertCalls(windowApi, nameof(FakeWindowApi.IsWindow));
    }

    [Fact]
    public void IsStillOwnedWindowRejectsPidMismatchBeforeVisibilityCheck()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.OwnerProcessId = ProcessId + 1;

        var result = validator.IsStillOwnedWindow(new ValidatedRestoreTarget(ProcessId, WindowHandle));

        Assert.False(result);
        AssertCalls(windowApi,
            nameof(FakeWindowApi.IsWindow),
            nameof(FakeWindowApi.GetWindowThreadProcessId));
    }

    [Fact]
    public void IsStillOwnedWindowRejectsHiddenWindow()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.WindowVisible = false;

        var result = validator.IsStillOwnedWindow(new ValidatedRestoreTarget(ProcessId, WindowHandle));

        Assert.False(result);
        AssertOwnershipCalls(windowApi);
    }

    [Fact]
    public void IsStillOwnedWindowDoesNotRequireForegroundTarget()
    {
        var (windowApi, validator) = CreateSubject();
        windowApi.ForegroundWindowHandle = new IntPtr(0x5678);

        var result = validator.IsStillOwnedWindow(new ValidatedRestoreTarget(ProcessId, WindowHandle));

        Assert.True(result);
        AssertOwnershipCalls(windowApi);
    }

    private static (FakeWindowApi WindowApi, RestoreTargetValidator Validator) CreateSubject()
    {
        var windowApi = new FakeWindowApi
        {
            OwnerProcessId = ProcessId,
            ForegroundWindowHandle = WindowHandle
        };

        return (windowApi, new RestoreTargetValidator(windowApi));
    }

    private static JsonElement CreateRequest(int? processId, string? windowHandle)
    {
        return JsonSerializer.SerializeToElement(new { processId, windowHandle });
    }

    private static void AssertFailure(RestoreTargetValidationResult result, string errorCode)
    {
        Assert.False(result.Ok);
        Assert.Null(result.Target);
        Assert.Equal(errorCode, result.ErrorCode);
        Assert.NotNull(result.ErrorMessage);
    }

    private static void AssertSuccess(RestoreTargetValidationResult result, ValidatedRestoreTarget target)
    {
        Assert.True(result.Ok);
        Assert.Equal(target, result.Target);
        Assert.Null(result.ErrorCode);
        Assert.Null(result.ErrorMessage);
    }

    private static void AssertValidationCalls(FakeWindowApi windowApi)
    {
        AssertCalls(windowApi,
            nameof(FakeWindowApi.IsWindow),
            nameof(FakeWindowApi.GetWindowThreadProcessId),
            nameof(FakeWindowApi.IsWindowVisible),
            nameof(FakeWindowApi.GetForegroundWindow));
    }

    private static void AssertOwnershipCalls(FakeWindowApi windowApi)
    {
        AssertCalls(windowApi,
            nameof(FakeWindowApi.IsWindow),
            nameof(FakeWindowApi.GetWindowThreadProcessId),
            nameof(FakeWindowApi.IsWindowVisible));
    }

    private static void AssertCalls(FakeWindowApi windowApi, params string[] expectedCalls)
    {
        Assert.Equal(expectedCalls, windowApi.Calls.ToArray());
    }
}
