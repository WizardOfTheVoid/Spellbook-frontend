using System.Net;
using CoreHost.Actions;
using CoreHost.Chivalry2;
using CoreHost.Debug;
using CoreHost.Middleware;
using CoreHost.Options;
using CoreHost.Runtime;
using CoreHost.Services;
using CoreHost.Status;

EnvFile.Load(
    Path.Combine(Directory.GetCurrentDirectory(), "src", "core", "CoreHost", ".env"),
    Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".env")),
    Path.Combine(AppContext.BaseDirectory, ".env"),
    Path.Combine(Directory.GetCurrentDirectory(), ".env"));

var builder = WebApplication.CreateBuilder(args);
var startupOptions = builder.Configuration.Get<CoreHostOptions>() ?? new();
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.WebHost.ConfigureKestrel(server => server.Listen(IPAddress.Parse(startupOptions.Core.Host), startupOptions.Core.Port));
builder.Services.AddCoreHostServices(builder.Configuration);

var app = builder.Build();
app.UseMiddleware<CompactRequestLoggingMiddleware>();
app.UseMiddleware<CoreAuthorizationMiddleware>();
app.mapActionEndpoints();
app.mapStatusEndpoints();
app.mapReadEndpoints();
app.mapChivalry2Endpoints();
app.mapDebugEndpoints();
app.Run();
