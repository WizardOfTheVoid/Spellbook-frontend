using System.Text;
using System.Text.Json;
using CoreHost.Endpoints;
using CoreHost.Models;
using CoreHost.Services;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace CoreHost.Tests;

public sealed class CoreHostWiringTests
{
    private static readonly ValidatedRestoreTarget GameTarget = new(55, new IntPtr(0x5678));

    [Fact]
    public void ConsoleInputMappingRegistersTypedListPlayersPostRoute()
    {
        using var subject = CreateRouteSubject();

        var endpoint = FindPostEndpoint(subject.Routes, "/v2/console/listplayers");

        Assert.Equal("/v2/console/listplayers", endpoint.RoutePattern.RawText);
    }

    [Theory]
    [InlineData("/v2/console/listplayers", "{\"id\":\"list-1\",\"background\":true}", "command")]
    [InlineData("/v2/console/message", "{\"id\":\"message-1\",\"kind\":\"admin\",\"message\":\"Mock\",\"background\":true}", "command")]
    [InlineData("/v2/console/batch", "{\"id\":\"batch-1\",\"commands\":[{\"commandType\":\"server_message\",\"message\":\"Hello\",\"delayMs\":0}],\"background\":true}", "batch")]
    public async Task TypedRoutesForwardBackgroundMode(
        string path,
        string body,
        string owner)
    {
        using var subject = CreateRouteSubject();

        await ExecuteAsync(subject, path, body);

        if (owner == "batch")
        {
            Assert.Equal([true], subject.BatchRuntime.ResolveBackgroundValues);
            Assert.Empty(subject.Targets.ResolveBackgroundValues);
        }
        else
        {
            Assert.Equal([true], subject.Targets.ResolveBackgroundValues);
            Assert.Empty(subject.BatchRuntime.ResolveBackgroundValues);
        }
    }

    [Fact]
    public async Task RawRouteCannotSelectBackgroundMode()
    {
        using var subject = CreateRouteSubject();

        await ExecuteAsync(
            subject,
            "/v2/console/command",
            "{\"id\":\"raw-1\",\"command\":\"ListPlayers\",\"background\":true}");

        Assert.Equal([false], subject.Targets.ResolveBackgroundValues);
        Assert.Empty(subject.BatchRuntime.ResolveBackgroundValues);
    }

    [Fact]
    public async Task ProductionRegistrationActivatesCommandAndBatchWithOneSharedGate()
    {
        var services = NewServiceCollection();
        using var validationRelease = new ManualResetEventSlim();
        var targets = new RecordingExecutionTargetResolver
        {
            BlockValidationUntil = validationRelease
        };
        var batchRuntime = new RecordingBatchRuntime();
        services.Replace(ServiceDescriptor.Singleton<IConsoleExecutionTargetResolver>(targets));
        services.Replace(ServiceDescriptor.Singleton<IConsoleBatchRuntime>(batchRuntime));
        await using var provider = services.BuildServiceProvider();
        var commandService = provider.GetRequiredService<ConsoleCommandService>();
        var batchService = provider.GetRequiredService<ConsoleCommandBatchService>();

        var command = Task.Run(() => commandService.ExecuteCommandAsync(
            "message-1",
            "Adminsay \"Hello\"",
            expectClipboard: false,
            restoreTarget: null,
            background: true,
            CancellationToken.None));
        await targets.ValidationStarted.Task.WaitAsync(
            TimeSpan.FromSeconds(1),
            TestContext.Current.CancellationToken);
        var batch = batchService.ExecuteAsync(
            "batch-1",
            [new PreparedConsoleCommand("warn", "Serversay \"Hello\"", 0)],
            restoreTarget: null,
            background: true,
            CancellationToken.None);

        try
        {
            await Assert.ThrowsAsync<TimeoutException>(async () =>
                await batchRuntime.ValidationStarted.Task.WaitAsync(
                    TimeSpan.FromMilliseconds(50),
                    TestContext.Current.CancellationToken));
        }
        finally
        {
            validationRelease.Set();
        }

        Assert.False((await command).Ok);
        Assert.False((await batch).Ok);
        Assert.Same(
            provider.GetRequiredService<ConsoleCommandGate>(),
            provider.GetRequiredService<ConsoleCommandGate>());
    }

    private static RouteSubject CreateRouteSubject()
    {
        var services = NewServiceCollection();
        var targets = new RecordingExecutionTargetResolver();
        var batchRuntime = new RecordingBatchRuntime();
        services.Replace(ServiceDescriptor.Singleton<IConsoleExecutionTargetResolver>(targets));
        services.Replace(ServiceDescriptor.Singleton<IConsoleBatchRuntime>(batchRuntime));
        var provider = services.BuildServiceProvider();
        var routeBuilder = new TestEndpointRouteBuilder(provider);
        routeBuilder.MapConsoleInputEndpoints();
        var routes = routeBuilder.DataSources
            .SelectMany(source => source.Endpoints)
            .OfType<RouteEndpoint>()
            .ToArray();
        return new RouteSubject(provider, routes, targets, batchRuntime);
    }

    private static ServiceCollection NewServiceCollection()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddRouting();
        services.AddCoreHostServices(new ConfigurationBuilder().Build());
        return services;
    }

    private static async Task ExecuteAsync(
        RouteSubject subject,
        string path,
        string body)
    {
        var endpoint = FindPostEndpoint(subject.Routes, path);
        var context = new DefaultHttpContext
        {
            RequestServices = subject.Provider
        };
        context.Request.Method = HttpMethods.Post;
        context.Request.Path = path;
        context.Request.ContentType = "application/json";
        context.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes(body));
        context.Request.ContentLength = context.Request.Body.Length;
        context.Response.Body = new MemoryStream();
        context.Features.Set<IHttpRequestBodyDetectionFeature>(new RequestBodyDetectionFeature());

        await endpoint.RequestDelegate!(context);
    }

    private static RouteEndpoint FindPostEndpoint(
        IReadOnlyList<RouteEndpoint> routes,
        string path)
    {
        return Assert.Single(routes, route =>
            route.RoutePattern.RawText == path &&
            route.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains(HttpMethods.Post) == true);
    }

    private sealed class TestEndpointRouteBuilder(IServiceProvider serviceProvider) : IEndpointRouteBuilder
    {
        public IServiceProvider ServiceProvider { get; } = serviceProvider;

        public ICollection<EndpointDataSource> DataSources { get; } = [];

        public IApplicationBuilder CreateApplicationBuilder()
        {
            return new ApplicationBuilder(ServiceProvider);
        }
    }

    private sealed class RequestBodyDetectionFeature : IHttpRequestBodyDetectionFeature
    {
        public bool CanHaveBody => true;
    }

    private sealed record RouteSubject(
        ServiceProvider Provider,
        IReadOnlyList<RouteEndpoint> Routes,
        RecordingExecutionTargetResolver Targets,
        RecordingBatchRuntime BatchRuntime) : IDisposable
    {
        public void Dispose() => Provider.Dispose();
    }

    private sealed class RecordingExecutionTargetResolver : IConsoleExecutionTargetResolver
    {
        public List<bool> ResolveBackgroundValues { get; } = [];

        public TaskCompletionSource ValidationStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public ManualResetEventSlim? BlockValidationUntil { get; init; }

        public RestoreTargetValidationResult Resolve(
            JsonElement? restoreTarget,
            bool background)
        {
            ResolveBackgroundValues.Add(background);
            return Success(GameTarget);
        }

        public RestoreTargetValidationResult Validate(
            ValidatedRestoreTarget target,
            bool requireForeground)
        {
            ValidationStarted.TrySetResult();
            BlockValidationUntil?.Wait(TestContext.Current.CancellationToken);
            return new RestoreTargetValidationResult(
                false,
                null,
                "RESTORE_TARGET_INACTIVE",
                "Stopped by wiring test.");
        }

        public RestoreTargetValidationResult ResolveGameTarget(
            ValidatedRestoreTarget leaseTarget,
            bool background)
        {
            return Success(leaseTarget);
        }

        private static RestoreTargetValidationResult Success(
            ValidatedRestoreTarget target)
        {
            return new RestoreTargetValidationResult(true, target, null, null);
        }
    }

    private sealed class RecordingBatchRuntime : IConsoleBatchRuntime
    {
        public List<bool> ResolveBackgroundValues { get; } = [];

        public TaskCompletionSource ValidationStarted { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public RestoreTargetValidationResult ResolveExecutionTarget(
            JsonElement? restoreTarget,
            bool background)
        {
            ResolveBackgroundValues.Add(background);
            return Success(GameTarget);
        }

        public RestoreTargetValidationResult ValidateExecutionTarget(
            ValidatedRestoreTarget restoreTarget,
            bool requireForeground)
        {
            ValidationStarted.TrySetResult();
            return new RestoreTargetValidationResult(
                false,
                null,
                "RESTORE_TARGET_INACTIVE",
                "Stopped by wiring test.");
        }

        public Task<OperationResult> FocusGameAsync(
            ValidatedRestoreTarget leaseTarget,
            bool background,
            CancellationToken cancellationToken)
        {
            throw new InvalidOperationException("Validation should stop the wiring test before focus.");
        }

        public Task<ConsoleCommandSubmitResult> SubmitAsync(
            PreparedConsoleCommand command,
            ConsoleOpenAttemptState attempt,
            CancellationToken cancellationToken)
        {
            throw new InvalidOperationException("Validation should stop the wiring test before input.");
        }

        public Task<ConsoleExecutionResult> CompleteAsync(
            ConsoleExecutionResult result,
            ConsoleOpenAttemptState attempt,
            ValidatedRestoreTarget restoreTarget,
            bool restoreForeground)
        {
            return Task.FromResult(result);
        }

        private static RestoreTargetValidationResult Success(
            ValidatedRestoreTarget target)
        {
            return new RestoreTargetValidationResult(true, target, null, null);
        }
    }
}
