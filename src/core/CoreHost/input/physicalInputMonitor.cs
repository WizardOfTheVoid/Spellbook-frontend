namespace CoreHost.Input;

public sealed class PhysicalInputMonitor : IHostedService, IAsyncDisposable
{
    private readonly InputActivityTracker activity;
    private readonly ILogger<PhysicalInputMonitor> logger;
    private readonly IPhysicalInputHooks hooks;
    private readonly TaskCompletionSource started = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly TaskCompletionSource stopped = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly ManualResetEvent stopSignal = new(false);
    private int launched, disposed;

    public PhysicalInputMonitor(InputActivityTracker activity, ILogger<PhysicalInputMonitor> logger) : this(activity, logger, new PhysicalInputHooks()) { }
    internal PhysicalInputMonitor(InputActivityTracker activity, ILogger<PhysicalInputMonitor> logger, IPhysicalInputHooks hooks)
    {
        this.activity = activity;
        this.logger = logger;
        this.hooks = hooks;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ObjectDisposedException.ThrowIf(Volatile.Read(ref disposed) != 0, this);
        if (Interlocked.Exchange(ref launched, 1) != 0) throw new InvalidOperationException("Physical input monitoring has already started.");
        new Thread(run) { IsBackground = true, Name = "SpellBook physical input" }.Start();
        try { await started.Task.WaitAsync(cancellationToken); }
        catch (OperationCanceledException) { stopSignal.Set(); throw; }
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        stopSignal.Set();
        if (Volatile.Read(ref launched) != 0) await stopped.Task.WaitAsync(cancellationToken);
    }

    private void run()
    {
        try
        {
            if (stopSignal.WaitOne(0)) return;
            hooks.initialize(activity);
            if (stopSignal.WaitOne(0)) return;
            activity.setAvailable(true);
            started.TrySetResult();
            while (hooks.processMessages(stopSignal)) { }
        }
        catch (Exception exception) { logger.LogError(exception, "Physical input monitoring stopped."); }
        finally
        {
            activity.setAvailable(false);
            try { hooks.release(); }
            catch (Exception exception) { logger.LogError(exception, "Physical input hooks could not be released."); }
            started.TrySetResult();
            stopped.TrySetResult();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        await StopAsync(CancellationToken.None);
        stopSignal.Dispose();
    }
}
