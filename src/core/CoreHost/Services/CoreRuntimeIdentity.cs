using CoreHost.Options;

namespace CoreHost.Services;

internal sealed record CoreRuntimeIdentitySnapshot(
    string Version,
    string InstanceId,
    int ProcessId,
    string Host,
    int Port);

internal static class CoreRuntimeIdentity
{
    internal static CoreRuntimeIdentitySnapshot Create(CoreHostOptions options)
    {
        ArgumentNullException.ThrowIfNull(options);

        return new CoreRuntimeIdentitySnapshot(
            ProductVersion.Value,
            options.Core.InstanceId,
            Environment.ProcessId,
            options.Core.Host,
            options.Core.Port);
    }
}