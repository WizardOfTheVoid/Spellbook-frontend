using SpellBook.Telemetry;
using Microsoft.AspNetCore.Server.Kestrel.Core;

if (args.Length == 3 && args[0] == "--capture-host")
{
    await ElevatedCaptureHost.Run(args[1],int.Parse(args[2]));
    return;
}
var options = TelemetryOptions.FromEnvironment();
var builder = WebApplication.CreateBuilder(new WebApplicationOptions { Args = [], ContentRootPath = AppContext.BaseDirectory });
builder.Logging.ClearProviders();
builder.WebHost.ConfigureKestrel(server => { server.Listen(System.Net.IPAddress.Loopback,0); server.Limits.MaxRequestBodySize = Wire.MaxBytes; });
var app = builder.Build();
var catalog = new RecordingCatalog(options); Directory.CreateDirectory(catalog.Root); RecordingRecovery.Run(catalog);
await using var runtime = new TelemetryOrchestrator(options,catalog);
var jobs = new RecordingReprocessJob(options,catalog,runtime);
ApiOrchestrator.Map(app,options,catalog,runtime,jobs);
using var lifetime = new CancellationTokenSource();
_ = ParentLease.Watch(options.ParentPid,lifetime);
using var registration = lifetime.Token.Register(app.Lifetime.StopApplication);
await app.StartAsync();
Console.WriteLine(Wire.Serialize(new { ready = true, instanceId = options.InstanceId, processId = Environment.ProcessId, protocolVersion = Wire.Version, version = options.Version, address = app.Urls.Single() }));
await app.WaitForShutdownAsync();
