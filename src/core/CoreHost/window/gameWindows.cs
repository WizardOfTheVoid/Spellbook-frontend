using CoreHost.Actions;
using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Services;
using CoreHost.Win32;
using Microsoft.Extensions.Options;

namespace CoreHost.Window;

public sealed class GameWindows(IGameProcessTargetLocator processes, IWindowApi native,
    IWindowReadiness readiness, ForegroundWindowService foreground, IOptionsMonitor<CoreHostOptions> options)
{
    private readonly object sync = new();
    private GameProcessInfo? game;
    private AppTarget? app;
    private long nextRefresh;

    public GameProcessInfo? gameProcess => Volatile.Read(ref game);

    public bool register(AppTarget target)
    {
        if (!ActionValidation.tryHandle(target.WindowHandle, out var handle) || !owned(handle, target.ProcessId)) return false;
        Volatile.Write(ref app, target);
        return true;
    }

    public bool matches(AppTarget target) => Volatile.Read(ref app) == target;

    public bool matchesGame(GameProcessInfo? target)
    {
        var current = Volatile.Read(ref game);
        return target is not null && current?.Id == target.Id && current.WindowHandle == target.WindowHandle &&
            owned(target.WindowHandle, target.Id);
    }

    public void refresh()
    {
        lock (sync)
        {
            if (Environment.TickCount64 < nextRefresh) return;
            nextRefresh = Environment.TickCount64 + options.CurrentValue.Window.ProcessPollMs;
            Volatile.Write(ref game, processes.GetTargetProcess().Process);
        }
    }

    public bool isRunning(string target)
    {
        var (handle, processId) = resolve(target);
        return owned(handle, processId);
    }

    public bool isFocused(string target)
    {
        var snapshot = resolve(target);
        return valid(target, snapshot) && native.GetForegroundWindow() == snapshot.Handle && valid(target, snapshot);
    }

    public bool isReady(string target)
    {
        var snapshot = resolve(target);
        return valid(target, snapshot) && readiness.isReady(snapshot.Handle) && valid(target, snapshot);
    }

    public object inspect(string target)
    {
        var snapshot = resolve(target);
        var running = valid(target, snapshot);
        var detail = running ? readiness.inspect(snapshot.Handle) : new WindowReadinessSnapshot(false, "WINDOW_NOT_FOUND");
        running = running && valid(target, snapshot);
        return new
        {
            handle = $"0x{snapshot.Handle.ToInt64():X}", processId = snapshot.ProcessId, running,
            focused = running && native.GetForegroundWindow() == snapshot.Handle, ready = running && detail.Ready, readiness = detail
        };
    }

    public async Task<OperationResult> focus(string target, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var snapshot = resolve(target);
        var startingForeground = native.GetForegroundWindow();
        bool validateTarget() => valid(target, snapshot) &&
            (native.GetForegroundWindow() == startingForeground || native.GetForegroundWindow() == snapshot.Handle);
        if (!validateTarget()) return OperationResult.Failure("WINDOW_NOT_FOUND", $"The {target} window is not available.");
        var config = options.CurrentValue.Window;
        var result = await foreground.FocusAndVerifyAsync(snapshot.Handle, config, cancellationToken, validateTarget: validateTarget);
        if (!result.Ok) return result;
        var settleMs = target == "game" ? config.FocusSettleMs : config.RestoreSettleMs;
        if (settleMs > 0) await Task.Delay(settleMs, cancellationToken);
        cancellationToken.ThrowIfCancellationRequested();
        return validateTarget() && readiness.isReady(snapshot.Handle) && validateTarget() ? OperationResult.Success()
            : OperationResult.Failure("WINDOW_NOT_READY", $"The {target} window is not ready for keyboard input.");
    }

    private bool valid(string target, (IntPtr Handle, int ProcessId) snapshot) =>
        owned(snapshot.Handle, snapshot.ProcessId) && resolve(target) == snapshot;

    private (IntPtr Handle, int ProcessId) resolve(string target)
    {
        if (target == "game")
        {
            var current = Volatile.Read(ref game);
            return (current?.WindowHandle ?? IntPtr.Zero, current?.Id ?? 0);
        }
        var currentApp = Volatile.Read(ref app);
        return target == "app" && currentApp is not null && ActionValidation.tryHandle(currentApp.WindowHandle, out var handle)
            ? (handle, currentApp.ProcessId) : (IntPtr.Zero, 0);
    }

    private bool owned(IntPtr handle, int processId)
    {
        if (handle == IntPtr.Zero || processId <= 0 || !native.IsWindow(handle)) return false;
        native.GetWindowThreadProcessId(handle, out var owner);
        return owner == processId;
    }
}
