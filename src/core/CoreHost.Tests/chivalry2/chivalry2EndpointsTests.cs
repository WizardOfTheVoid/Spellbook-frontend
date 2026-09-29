using System.Net;
using System.Text.Json;
using CoreHost.Chivalry2;
using CoreHost.Options;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CoreHost.Tests.Chivalry2;

public sealed class Chivalry2EndpointsTests
{
    [Theory]
    [InlineData("GET", "/chivalry2/config/")]
    [InlineData("GET", "/chivalry2/gameusersettings/")]
    [InlineData("GET", "/chivalry2/game/")]
    [InlineData("PATCH", "/chivalry2/gameusersettings/?key=bConsoleEnabled&value=True")]
    [InlineData("PATCH", "/chivalry2/game/?key=Key&value=new")]
    public async Task configRoutesRequireSharedToken(string method, string path)
    {
        await using var host = await ConfigEndpointHost.start();
        foreach (var token in new string?[] { null, "wrong-token" })
        {
            using var response = await host.send(method, path, token);
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }
        Assert.Equal("[First]\nKey=old\n", await File.ReadAllTextAsync(host.files.path("Game.ini"), TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData("/chivalry2/gameusersettings/", "GameUserSettings.ini", "/Script/TBL.TBLGameUserSettings", "bConsoleEnabled", "False")]
    [InlineData("/chivalry2/game/", "Game.ini", "First", "Key", "old")]
    public async Task individualReadsReturnSectionAwareStringArrays(string path, string file, string section, string key, string expected)
    {
        await using var host = await ConfigEndpointHost.start();
        using var response = await host.send("GET", path);
        using var json = await ConfigEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = json.RootElement.GetProperty("data");
        Assert.Equal(file, data.GetProperty("file").GetString());
        Assert.Equal(expected, data.GetProperty("sections").GetProperty(section).GetProperty(key)[0].GetString());
    }

    [Fact]
    public async Task combinedReadReturnsBothNamedFiles()
    {
        await using var host = await ConfigEndpointHost.start();
        using var response = await host.send("GET", "/chivalry2/config/");
        using var json = await ConfigEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var data = json.RootElement.GetProperty("data");
        Assert.Equal("False", data.GetProperty("gameusersettings").GetProperty("sections").GetProperty("/Script/TBL.TBLGameUserSettings").GetProperty("bConsoleEnabled")[0].GetString());
        Assert.Equal("old", data.GetProperty("game").GetProperty("sections").GetProperty("First").GetProperty("Key")[0].GetString());
    }

    [Theory]
    [InlineData("/chivalry2/gameusersettings/?key=bConsoleEnabled&value=True", "GameUserSettings.ini", "[/Script/TBL.TBLGameUserSettings]\nbConsoleEnabled=True\n")]
    [InlineData("/chivalry2/game/?key=Key&value=new", "Game.ini", "[First]\nKey=new\n")]
    [InlineData("/chivalry2/game/?key=New&value=%28Name%3D%22A%26B%22%29&section=%2FScript%2FTBL.Other", "Game.ini", "[First]\nKey=old\n[/Script/TBL.Other]\nNew=(Name=\"A&B\")\n")]
    [InlineData("/chivalry2/game/?key=Key&value=", "Game.ini", "[First]\nKey=\n")]
    public async Task patchUsesQueryValuesAndConfirmsDiskUpdate(string path, string file, string expected)
    {
        await using var host = await ConfigEndpointHost.start();
        using var response = await host.send("PATCH", path);
        using var json = await ConfigEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(json.RootElement.GetProperty("data").GetProperty("updated").GetBoolean());
        Assert.Equal(expected, await File.ReadAllTextAsync(host.files.path(file), TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData(" \tnew \t", "new")]
    [InlineData(" \t\" new # ; \" \t", "\" new # ; \"")]
    [InlineData(" \t ", "")]
    public async Task repeatedPatchNormalizesOuterWhitespaceAndPreservesQuotedValues(string value, string expected)
    {
        await using var host = await ConfigEndpointHost.start();
        await host.files.write("Game.ini", "[First]\r\nKey = old  ; keep comment\r\nOther=001\r\n");
        var path = $"/chivalry2/game/?key=Key&value={Uri.EscapeDataString(value)}";
        using var first = await host.send("PATCH", path);
        using var firstJson = await ConfigEndpointHost.json(first);
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.True(firstJson.RootElement.GetProperty("data").GetProperty("updated").GetBoolean());
        var firstBytes = await File.ReadAllBytesAsync(host.files.path("Game.ini"), TestContext.Current.CancellationToken);

        using var repeated = await host.send("PATCH", path);
        using var repeatedJson = await ConfigEndpointHost.json(repeated);

        Assert.Equal(HttpStatusCode.OK, repeated.StatusCode);
        Assert.False(repeatedJson.RootElement.GetProperty("data").GetProperty("updated").GetBoolean());
        Assert.Equal(firstBytes, await File.ReadAllBytesAsync(host.files.path("Game.ini"), TestContext.Current.CancellationToken));
        Assert.Equal($"[First]\r\nKey = {expected}  ; keep comment\r\nOther=001\r\n",
            await File.ReadAllTextAsync(host.files.path("Game.ini"), TestContext.Current.CancellationToken));
        using var read = await host.send("GET", "/chivalry2/game/");
        using var readJson = await ConfigEndpointHost.json(read);
        Assert.Equal(expected, readJson.RootElement.GetProperty("data").GetProperty("sections").GetProperty("First").GetProperty("Key")[0].GetString());
    }

    [Theory]
    [InlineData("/chivalry2/game/?value=new")]
    [InlineData("/chivalry2/game/?key=Key")]
    [InlineData("/chivalry2/game/?key=Key&key=Other&value=new")]
    [InlineData("/chivalry2/game/?key=Key&value=one&value=two")]
    [InlineData("/chivalry2/game/?key=Key&value=new&section=First&section=Other")]
    [InlineData("/chivalry2/game/?key=Key&value=new%0AOther%3D1")]
    public async Task patchRejectsInvalidScalarQueryWithoutWriting(string path)
    {
        await using var host = await ConfigEndpointHost.start();
        using var response = await host.send("PATCH", path);
        using var json = await ConfigEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("INVALID_REQUEST", json.RootElement.GetProperty("error").GetProperty("code").GetString());
        Assert.Equal("[First]\nKey=old\n", await File.ReadAllTextAsync(host.files.path("Game.ini"), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task missingFileReturnsUsefulError()
    {
        await using var host = await ConfigEndpointHost.start();
        File.Delete(host.files.path("Game.ini"));

        using var response = await host.send("GET", "/chivalry2/game/");
        using var json = await ConfigEndpointHost.json(response);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("INI_FILE_NOT_FOUND", json.RootElement.GetProperty("error").GetProperty("code").GetString());
    }
}

internal sealed class ConfigEndpointHost(WebApplication app, HttpClient client, ConfigFiles configFiles) : IAsyncDisposable
{
    internal ConfigFiles files { get; } = configFiles;

    internal static async Task<ConfigEndpointHost> start()
    {
        var files = new ConfigFiles();
        await files.write("Game.ini", "[First]\nKey=old\n");
        await files.write("GameUserSettings.ini", "[/Script/TBL.TBLGameUserSettings]\nbConsoleEnabled=False\n");
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing", ContentRootPath = files.directory });
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Services.AddSingleton(files.config);
        builder.Services.Configure<CoreHostOptions>(options => options.Core.AuthToken = "config-test-token");
        var app = builder.Build();
        app.mapChivalry2Endpoints();
        await app.StartAsync(TestContext.Current.CancellationToken);
        return new(app, new HttpClient { BaseAddress = new Uri(app.Urls.Single()) }, files);
    }

    internal async Task<HttpResponseMessage> send(string method, string path, string? token = "config-test-token")
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (token is not null) request.Headers.Add("X-Chiv-Admin-Token", token);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    internal static async Task<JsonDocument> json(HttpResponseMessage response) => JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));

    public async ValueTask DisposeAsync()
    {
        client.Dispose();
        await app.DisposeAsync();
        files.Dispose();
    }
}
