using CoreHost.Options;
using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class CoreRuntimeIdentityTests
{
    [Fact]
    public void RuntimeIdentityIncludesConfiguredInstanceAndCurrentProcess()
    {
        var options = new CoreHostOptions
        {
            Core = new CoreApiOptions
            {
                Host = "127.0.0.1",
                Port = 49200,
                InstanceId = "instance-123"
            }
        };

        var identity = CoreRuntimeIdentity.Create(options);

        Assert.Equal("instance-123", identity.InstanceId);
        Assert.Equal(Environment.ProcessId, identity.ProcessId);
        Assert.Equal(ProductVersion.Value, identity.Version);
        Assert.Equal("127.0.0.1", identity.Host);
        Assert.Equal(49200, identity.Port);
    }

    [Fact]
    public void CoreApiOptionsUseTheDevelopmentInstanceByDefault()
    {
        Assert.Equal("development", new CoreApiOptions().InstanceId);
    }
}