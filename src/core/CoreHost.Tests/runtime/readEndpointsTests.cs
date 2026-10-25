using System.Net;

namespace CoreHost.Tests.Runtime;

public sealed class ReadEndpointsTests
{
    [Fact]
    public async Task textRecognitionEndpointIsRetired()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var response = await host.send("POST", "/v2/console/snapshot", new { id = "invalid!" });
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Empty(host.input.events);
    }

    [Fact]
    public async Task imageCaptureStillValidatesRequestsWithoutSendingInput()
    {
        await using var host = await RuntimeEndpointHost.start();
        using var response = await host.send("POST", "/v2/snapshot/image", new { id = "invalid!" });
        using var json = await RuntimeEndpointHost.json(response);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("INVALID_REQUEST", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Empty(host.input.events);
    }
}
