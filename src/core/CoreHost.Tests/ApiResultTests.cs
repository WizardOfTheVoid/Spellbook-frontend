using System.Text.Json;
using CoreHost.Models;
using Microsoft.AspNetCore.Http;

namespace CoreHost.Tests;

public sealed class ApiResultTests
{
    [Fact]
    public void FailureEnvelopeRetainsCleanupWarnings()
    {
        var envelope = ApiResult.FailureEnvelope(
            "COMMAND_TIMEOUT",
            "Console command execution timed out.",
            "request-1",
            ["FOREGROUND_RESTORE_FAILED"]);

        Assert.Equal(["FOREGROUND_RESTORE_FAILED"], envelope.Warnings);
    }

    [Fact]
    public void FailedExecutionRetainsCleanupWarnings()
    {
        var execution = ConsoleExecutionResult.Failure(
            "COMMAND_TIMEOUT",
            "Console command execution timed out.",
            "request-1",
            StatusCodes.Status504GatewayTimeout,
            ["RESTORE_TARGET_LOST"]);

        var httpResult = Assert.IsAssignableFrom<IValueHttpResult>(ApiResult.FromExecution(execution));
        var envelope = Assert.IsType<ApiEnvelope<object?>>(httpResult.Value);

        Assert.False(envelope.Ok);
        Assert.Equal(["RESTORE_TARGET_LOST"], envelope.Warnings);
    }

    [Fact]
    public void FailedExecutionRetainsBatchProgressData()
    {
        var execution = ConsoleExecutionResult.Failure(
            "INPUT_FAILED",
            "The second command failed.",
            "request-1",
            StatusCodes.Status409Conflict,
            ["FOREGROUND_RESTORE_FAILED"],
            new { sentCommands = 1, failedCommandIndex = 1 });

        var httpResult = Assert.IsAssignableFrom<IValueHttpResult>(ApiResult.FromExecution(execution));
        var envelope = Assert.IsType<ApiEnvelope<object?>>(httpResult.Value);
        var data = JsonSerializer.SerializeToElement(envelope.Data);

        Assert.False(envelope.Ok);
        Assert.Equal("INPUT_FAILED", envelope.Error?.Code);
        Assert.Equal(["FOREGROUND_RESTORE_FAILED"], envelope.Warnings);
        Assert.Equal(1, data.GetProperty("sentCommands").GetInt32());
        Assert.Equal(1, data.GetProperty("failedCommandIndex").GetInt32());
    }
}
