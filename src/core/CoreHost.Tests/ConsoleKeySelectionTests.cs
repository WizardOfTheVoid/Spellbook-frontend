using CoreHost.Middleware;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Tests.Fakes;
using CoreHost.Win32;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;

namespace CoreHost.Tests;

public sealed class ConsoleKeySelectionTests
{
    [Fact]
    public async Task ConcurrentRequestsKeepTheirOwnConsoleKey()
    {
        var accessor = new HttpContextAccessor();
        var selection = new ConsoleKeySelection(accessor);
        async Task<string> ReadAsync(string code)
        {
            accessor.HttpContext = Context(code);
            await Task.Yield();
            return selection.Code ?? throw new InvalidOperationException("Request key was lost.");
        }

        Assert.Equal(["Backquote", "KeyA"], await Task.WhenAll(ReadAsync("Backquote"), ReadAsync("KeyA")));
    }

    [Theory]
    [InlineData("Backquote", 41, 8)]
    [InlineData("NumpadSubtract", 74, 8)]
    [InlineData("KeyA", 30, 8)]
    [InlineData("Delete", 83, 9)]
    [InlineData("NumpadDivide", 53, 9)]
    public async Task SelectedPhysicalKeyOverridesOnlyConsoleOpen(string code, ushort scanCode, uint flags)
    {
        var context = Context(code);
        var input = new FakeKeyboardInputApi();
        var service = new SendInputService(input, Selection(context));
        var attempt = new ConsoleOpenAttemptState();
        var options = new ConsoleAutomationOptions();

        var result = await service.SendConsoleOpenSequenceAsync(options, new TimingOptions(), attempt, CancellationToken.None);
        Assert.True(result.Ok);
        Assert.True(attempt.MayBeOpen);
        Assert.False(attempt.CommandSubmitted);
        Assert.Equal([
            new KeyboardInputEvent(0, scanCode, flags),
            new KeyboardInputEvent(0, scanCode, flags | 2)
        ], Assert.Single(input.InputBatches));
        Assert.Equal("NumpadSubtractOnce", options.OpenMode);
        Assert.Equal("None", options.CloseMode);

        await service.SendConsoleCloseSequenceAsync(options, new TimingOptions(), CancellationToken.None);
        Assert.Single(input.InputBatches);
    }

    [Fact]
    public async Task MissingHeaderUsesExistingConfiguredMode()
    {
        var input = new FakeKeyboardInputApi();
        var service = new SendInputService(input, Selection(Context(null)));
        await service.SendConsoleOpenSequenceAsync(new ConsoleAutomationOptions(), new TimingOptions(), new ConsoleOpenAttemptState(), CancellationToken.None);
        Assert.Equal((ushort)0x6D, Assert.Single(input.InputBatches)[0].VirtualKey);
    }

    [Theory]
    [InlineData(0, false)]
    [InlineData(1, true)]
    public async Task PartialSelectedKeyInputPreservesCleanupState(uint sent, bool mayBeOpen)
    {
        var input = new FakeKeyboardInputApi { Sent = sent, Error = 5 };
        var service = new SendInputService(input, Selection(Context("Backquote")));
        var attempt = new ConsoleOpenAttemptState();
        var result = await service.SendConsoleOpenSequenceAsync(new ConsoleAutomationOptions(), new TimingOptions(), attempt, CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Equal("INPUT_FAILED", result.ErrorCode);
        Assert.Equal(mayBeOpen, attempt.MayBeOpen);
    }

    [Fact]
    public async Task CancellationAfterSelectedKeyInputPreservesCleanupState()
    {
        using var cancellation = new CancellationTokenSource();
        var input = new FakeKeyboardInputApi { OnSend = _ => cancellation.Cancel() };
        var service = new SendInputService(input, Selection(Context("Backquote")));
        var attempt = new ConsoleOpenAttemptState();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.SendConsoleOpenSequenceAsync(
            new ConsoleAutomationOptions(), new TimingOptions { BetweenKeyDelayMs = 100 }, attempt, cancellation.Token));
        Assert.True(attempt.MayBeOpen);
    }

    [Theory]
    [InlineData("")]
    [InlineData("KeyA,KeyB")]
    [InlineData("ShiftLeft")]
    [InlineData("Enter")]
    [InlineData("F3")]
    [InlineData("F4")]
    [InlineData("F12")]
    [InlineData("74")]
    [InlineData("__proto__")]
    public async Task UnsupportedKeyIsRejectedBeforeEndpointAndInput(string code)
    {
        var context = Context(code);
        var called = false;
        await new ConsoleKeyValidationMiddleware(_ => { called = true; return Task.CompletedTask; }).InvokeAsync(context);
        Assert.Equal(400, context.Response.StatusCode);
        Assert.False(called);

        var input = new FakeKeyboardInputApi();
        var service = new SendInputService(input, Selection(context));
        var result = await service.SendConsoleOpenSequenceAsync(new ConsoleAutomationOptions(), new TimingOptions(), new ConsoleOpenAttemptState(), CancellationToken.None);
        Assert.False(result.Ok);
        Assert.Empty(input.InputBatches);
    }

    [Fact]
    public async Task MultipleKeyHeadersAreRejected()
    {
        var context = Context("KeyA");
        context.Request.Headers[ConsoleKeySelection.HeaderName] = new StringValues(["KeyA", "KeyB"]);
        await new ConsoleKeyValidationMiddleware(_ => throw new InvalidOperationException("Must not run endpoint")).InvokeAsync(context);
        Assert.Equal(400, context.Response.StatusCode);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("Backquote")]
    public async Task SupportedOrMissingKeyReachesEndpoint(string? code)
    {
        var called = false;
        await new ConsoleKeyValidationMiddleware(_ => { called = true; return Task.CompletedTask; }).InvokeAsync(Context(code));
        Assert.True(called);
    }

    private static ConsoleKeySelection Selection(HttpContext context) => new(new HttpContextAccessor { HttpContext = context });

    private static HttpContext Context(string? code)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = "POST";
        context.Request.Path = "/v2/console/command";
        context.Response.Body = new MemoryStream();
        if (code is not null) context.Request.Headers[ConsoleKeySelection.HeaderName] = code;
        return context;
    }
}
