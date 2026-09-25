using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using CoreHost.Actions;
using CoreHost.Debug;
using CoreHost.Input;
using CoreHost.Middleware;
using CoreHost.Models;
using CoreHost.Services;
using CoreHost.Status;
using CoreHost.Window;
using CoreHost.Win32;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CoreHost.Tests.Runtime;

internal sealed class RuntimeEndpointHost(WebApplication app, HttpClient client, EndpointWindows windows,
    EndpointKeyboard keyboard, EndpointClipboard clipboard) : IAsyncDisposable
{
    internal const string token = "runtime-test-token";
    internal EndpointWindows native { get; } = windows;
    internal EndpointKeyboard input { get; } = keyboard;
    internal EndpointClipboard copied { get; } = clipboard;
    internal IServiceProvider services => app.Services;

    internal static async Task<RuntimeEndpointHost> start(bool gameRunning = true,
        IReadOnlyDictionary<string, string?>? configuration = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Testing" });
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Configuration.AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Core:AuthToken"] = token, ["QUEUE_GATE_NORMAL"] = "0", ["QUEUE_GATE_LOW"] = "0", ["QUEUE_GATE_HIGH"] = "0", ["Input:SubmitSettleMs"] = "0",
            ["Window:FocusSettleMs"] = "0", ["Window:RestoreSettleMs"] = "0"
        });
        if (configuration is not null) builder.Configuration.AddInMemoryCollection(configuration);
        builder.Services.AddCoreHostServices(builder.Configuration);
        // The worker and runtime stay registered; only native boundaries are replaced.
        builder.Services.Remove(builder.Services.Single(service => service.ServiceType == typeof(IHostedService) &&
            service.ImplementationType == typeof(PhysicalInputMonitor)));
        var windows = new EndpointWindows();
        var clipboard = new EndpointClipboard();
        var keyboard = new EndpointKeyboard(clipboard);
        builder.Services.Replace(ServiceDescriptor.Singleton<IWindowApi>(windows));
        builder.Services.Replace(ServiceDescriptor.Singleton<ICursorApi>(windows));
        builder.Services.Replace(ServiceDescriptor.Singleton<IWindowReadiness>(windows));
        builder.Services.Replace(ServiceDescriptor.Singleton<IGameProcessTargetLocator>(new EndpointProcesses(gameRunning)));
        builder.Services.Replace(ServiceDescriptor.Singleton<IKeyboardInputApi>(keyboard));
        builder.Services.Replace(ServiceDescriptor.Singleton<IClipboardService>(clipboard));
        var app = builder.Build();
        app.UseMiddleware<CoreAuthorizationMiddleware>();
        app.mapActionEndpoints();
        app.mapStatusEndpoints();
        app.mapDebugEndpoints();
        app.Services.GetRequiredService<InputActivityTracker>().setAvailable(true);
        try
        {
            await app.StartAsync(TestContext.Current.CancellationToken);
            return new(app, new HttpClient { BaseAddress = new Uri(app.Urls.Single()) }, windows, keyboard, clipboard);
        }
        catch { await app.DisposeAsync(); throw; }
    }

    internal async Task<HttpResponseMessage> send(string method, string path, object? body = null, string? auth = token)
    {
        using var request = new HttpRequestMessage(new HttpMethod(method), path);
        if (auth is not null) request.Headers.Add("X-Chiv-Admin-Token", auth);
        if (body is not null) request.Content = JsonContent.Create(body, options: new(JsonSerializerDefaults.Web)
        { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull });
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    internal static CoreActionRequest action(params CoreCommand[] commands) =>
        new(Guid.NewGuid().ToString(), Guid.NewGuid().ToString(), "user", "normal", new(11, "0x1"), commands);

    internal static async Task<JsonDocument> json(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));

    public async ValueTask DisposeAsync()
    {
        client.Dispose();
        await app.StopAsync(TestContext.Current.CancellationToken);
        await app.DisposeAsync();
    }
}

internal sealed class EndpointProcesses(bool running) : IGameProcessTargetLocator
{
    public GameProcessLookupResult GetTargetProcess() => running
        ? GameProcessLookupResult.Found(new(2, 22, "test-game", null, true, "0x2", "Test game", null), [])
        : GameProcessLookupResult.Failure("GAME_NOT_RUNNING", "No game in this fixture.");
}

internal sealed class EndpointWindows : IWindowApi, IWindowReadiness, ICursorApi
{
    internal IntPtr foreground = 2;
    internal uint? cursorFlags = 0;
    internal Action? onCursorRead;
    public uint? getFlags() { onCursorRead?.Invoke(); return cursorFlags; }
    public IntPtr GetForegroundWindow() => foreground;
    public bool SetForegroundWindow(IntPtr window) { foreground = window; return true; }
    public bool BringWindowToTop(IntPtr window) => true;
    public bool AttachThreadInput(uint from, uint to, bool attach) => true;
    public bool IsIconic(IntPtr window) => false;
    public bool ShowWindow(IntPtr window, int command) => true;
    public bool IsWindow(IntPtr window) => window == 1 || window == 2;
    public bool IsWindowVisible(IntPtr window) => true;
    public uint GetCurrentThreadId() => 10;
    public uint GetWindowThreadProcessId(IntPtr window, out uint owner) { owner = window == 1 ? 11u : 22u; return owner; }
    public bool isReady(IntPtr window) => foreground == window;
}

internal sealed class EndpointKeyboard(EndpointClipboard clipboard) : IKeyboardInputApi
{
    internal ConcurrentQueue<KeyboardInputEvent> events { get; } = new();
    public KeyboardInputSendResult Send(IReadOnlyList<KeyboardInputEvent> inputs)
    {
        foreach (var input in inputs)
        {
            events.Enqueue(input);
            if (input.VirtualKey == 13 && (input.Flags & 2) == 0) clipboard.submitted();
        }
        return new((uint)inputs.Count, 0);
    }
}

internal sealed class EndpointClipboard : IClipboardService
{
    internal string text = "original clipboard";
    internal string? output;
    private uint sequence;
    public uint GetSequenceNumber() => sequence;
    public Task<ClipboardTextResult> ReadTextAsync(CancellationToken cancellationToken) => Task.FromResult(ClipboardTextResult.TextValue(text));
    public Task<OperationResult> SetTextAsync(string value, CancellationToken cancellationToken, uint? expectedSequence = null)
    {
        if (expectedSequence is { } expected && expected != sequence)
            return Task.FromResult(OperationResult.Failure("CLIPBOARD_CHANGED", "Changed."));
        text = value;
        sequence++;
        return Task.FromResult(OperationResult.Success());
    }
    internal void submitted() { if (output is not null) { text = output; sequence++; } }
}
