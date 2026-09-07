using System.Reflection;

namespace CoreHost.Services;

internal static class ProductVersion
{
    internal static string Value =>
        typeof(ProductVersion).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()?
            .InformationalVersion?.Split('+')[0]
        ?? throw new InvalidOperationException("Core product version metadata is missing.");
}