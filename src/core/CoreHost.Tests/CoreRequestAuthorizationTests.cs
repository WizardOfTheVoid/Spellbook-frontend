using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class CoreRequestAuthorizationTests
{
    [Fact]
    public void ExactTokenIsAuthorized()
    {
        Assert.True(CoreRequestAuthorization.IsAuthorized("expected", "expected"));
    }

    [Theory]
    [InlineData(null, "expected")]
    [InlineData("", "expected")]
    [InlineData("expected", "")]
    [InlineData("wrong", "expected")]
    [InlineData("expecteD", "expected")]
    public void MissingBlankOrDifferentTokensAreRejected(string? suppliedToken, string expectedToken)
    {
        Assert.False(CoreRequestAuthorization.IsAuthorized(suppliedToken, expectedToken));
    }
}