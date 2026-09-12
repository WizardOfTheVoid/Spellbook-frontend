using CoreHost.Input;
using Microsoft.Extensions.Logging.Abstractions;

namespace CoreHost.Tests.Input;

public sealed class PhysicalInputMonitorTests
{
    [Fact]
    public async Task cancelledStartupReleasesHooksWithoutSeparateStop()
    {
        using var hooks = new Hooks();
        var activity = new InputActivityTracker();
        var monitor = new PhysicalInputMonitor(activity, NullLogger<PhysicalInputMonitor>.Instance, hooks);
        using var cancellation = new CancellationTokenSource();
        var start = monitor.StartAsync(cancellation.Token);
        await hooks.Initializing.Task.WaitAsync(TestContext.Current.CancellationToken);
        try
        {
            cancellation.Cancel();
            await Assert.ThrowsAnyAsync<OperationCanceledException>(() => start);
            hooks.AllowInitialization.Set();
            await hooks.Released.Task.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken);
            Assert.False(hooks.Installed);
            Assert.False(activity.snapshot(0).Available);
        }
        finally { await finish(monitor, hooks); }
    }

    [Fact]
    public async Task stopDuringInitializationIsNotLost()
    {
        using var hooks = new Hooks();
        var activity = new InputActivityTracker();
        var monitor = new PhysicalInputMonitor(activity, NullLogger<PhysicalInputMonitor>.Instance, hooks);
        var start = monitor.StartAsync(TestContext.Current.CancellationToken);
        await hooks.Initializing.Task.WaitAsync(TestContext.Current.CancellationToken);
        try
        {
            var stop = monitor.StopAsync(TestContext.Current.CancellationToken);
            hooks.AllowInitialization.Set();
            await stop.WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken);
            await start;
            Assert.False(hooks.Installed);
            Assert.False(activity.snapshot(0).Available);
        }
        finally { await finish(monitor, hooks); }
    }

    [Fact]
    public async Task stopWakesMessageWaitAndReleasesHooks()
    {
        using var hooks = new Hooks();
        hooks.AllowInitialization.Set();
        var activity = new InputActivityTracker();
        var monitor = new PhysicalInputMonitor(activity, NullLogger<PhysicalInputMonitor>.Instance, hooks);
        await monitor.StartAsync(TestContext.Current.CancellationToken);
        await hooks.Waiting.Task.WaitAsync(TestContext.Current.CancellationToken);
        try
        {
            await monitor.StopAsync(TestContext.Current.CancellationToken).WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken);
            Assert.False(hooks.Installed);
            Assert.False(activity.snapshot(0).Available);
        }
        finally { await finish(monitor, hooks); }
    }

    private static async Task finish(PhysicalInputMonitor monitor, Hooks hooks)
    {
        hooks.AllowInitialization.Set();
        hooks.Quit.Set();
        await monitor.StopAsync(TestContext.Current.CancellationToken).WaitAsync(TimeSpan.FromSeconds(1), TestContext.Current.CancellationToken);
        await monitor.DisposeAsync();
    }

    private sealed class Hooks : IPhysicalInputHooks, IDisposable
    {
        internal readonly ManualResetEvent AllowInitialization = new(false), Quit = new(false);
        internal readonly TaskCompletionSource Initializing = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal readonly TaskCompletionSource Waiting = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal readonly TaskCompletionSource Released = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal volatile bool Installed;

        public void initialize(InputActivityTracker activity)
        {
            Initializing.TrySetResult();
            AllowInitialization.WaitOne();
            Installed = true;
        }

        public bool processMessages(WaitHandle stopSignal)
        {
            Waiting.TrySetResult();
            WaitHandle.WaitAny([Quit, stopSignal]);
            return false;
        }

        public void release() { Installed = false; Released.TrySetResult(); }
        public void Dispose() { AllowInitialization.Dispose(); Quit.Dispose(); }
    }
}
