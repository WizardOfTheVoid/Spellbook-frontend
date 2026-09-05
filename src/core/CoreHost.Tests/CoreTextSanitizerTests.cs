using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class CoreTextSanitizerTests
{
    [Fact]
    public void NormalizesSymbolsBeforeExistingOutboundNormalization()
    {
        var sanitizer = CreateSanitizer(new Dictionary<string, string>
        {
            ["∆"] = "A",
            ["♥"] = "heart"
        });

        var ok = sanitizer.TryNormalizeOutboundMessage(
            "M∆GIC ♥",
            "Message",
            out var normalized,
            out var error);

        Assert.True(ok);
        Assert.Null(error);
        Assert.Equal("MAGIC heart", normalized);
    }

    [Fact]
    public void AppliesLengthLimitAfterMappingExpansion()
    {
        var sanitizer = CreateSanitizer(new Dictionary<string, string>
        {
            ["♥"] = new string('x', RequestValidators.MaxQuotedTextLength + 20)
        });

        var ok = sanitizer.TryNormalizeOutboundMessage(
            "♥",
            "Message",
            out var normalized,
            out _);

        Assert.True(ok);
        Assert.Equal(RequestValidators.MaxQuotedTextLength, normalized.Length);
    }

    [Theory]
    [InlineData("line\nbreak")]
    [InlineData("line\rbreak")]
    [InlineData("line\0break")]
    public void RetainsForbiddenSourceCharacterChecks(string value)
    {
        var ok = CreateSanitizer(new Dictionary<string, string>())
            .TryNormalizeOutboundMessage(value, "Message", out _, out var error);

        Assert.False(ok);
        Assert.Contains("CR, LF, or NUL", error);
    }

    [Fact]
    public void RawCommandValidationDoesNotApplySymbolNormalization()
    {
        const string raw = "Serversay \"M∆GIC ♥\"";

        var ok = RequestValidators.TryNormalizeCommand(raw, out var normalized, out _);

        Assert.True(ok);
        Assert.Equal(raw, normalized);
    }

    private static CoreTextSanitizer CreateSanitizer(
        IReadOnlyDictionary<string, string> mapping)
    {
        return new CoreTextSanitizer(new SymbolNormalization(mapping));
    }
}
