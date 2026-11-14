using System.Reflection;
using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class ProductVersionTests
{
    [Fact]
    public void ValueMatchesAssemblyInformationalVersion()
    {
        var assemblyVersion = typeof(ProductVersion).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion?.Split('+')[0];

        Assert.Equal(assemblyVersion, ProductVersion.Value);
    }
}