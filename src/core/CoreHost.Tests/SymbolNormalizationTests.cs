using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class SymbolNormalizationTests
{
    [Fact]
    public void ApplyUsesLongestLiteralKeysWithoutRecursion()
    {
        var normalization = new SymbolNormalization(new Dictionary<string, string>
        {
            ["♥"] = "heart",
            ["♥️"] = "love",
            ["∆"] = "A",
            ["A"] = "B"
        });

        Assert.Equal("love A", normalization.Apply("♥️ ∆"));
    }

    [Theory]
    [InlineData("", "A")]
    [InlineData("∆", "")]
    [InlineData("∆", "A\n")]
    public void ConstructorRejectsInvalidEntries(string key, string value)
    {
        var error = Assert.Throws<InvalidOperationException>(() =>
            new SymbolNormalization(new Dictionary<string, string> { [key] = value }));

        Assert.Contains("symbolNormalization.json", error.Message);
    }

    [Fact]
    public void PathConstructorNamesMissingConfiguration()
    {
        var path = Path.Combine(Path.GetTempPath(), $"missing-{Guid.NewGuid():N}.json");

        var error = Assert.Throws<InvalidOperationException>(() => new SymbolNormalization(path));

        Assert.Contains("symbolNormalization.json", error.Message);
    }

    [Fact]
    public void PathConstructorNamesMalformedConfiguration()
    {
        var path = Path.Combine(Path.GetTempPath(), $"invalid-{Guid.NewGuid():N}.json");
        File.WriteAllText(path, "[]");

        try
        {
            var error = Assert.Throws<InvalidOperationException>(() =>
                new SymbolNormalization(path));
            Assert.Contains("symbolNormalization.json", error.Message);
        }
        finally
        {
            File.Delete(path);
        }
    }
}
