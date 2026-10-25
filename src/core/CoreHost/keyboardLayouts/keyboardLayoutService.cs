using CoreHost.Input;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.KeyboardLayouts;

public sealed class KeyboardLayoutService(IKeyboardLayoutApi api, InputActivityTracker input, KeyboardInput keyboard,
    IOptionsMonitor<CoreHostOptions> options, TimeProvider? timeProvider = null)
{
    private readonly SemaphoreSlim scope = new(1, 1);
    private readonly TimeProvider clock = timeProvider ?? TimeProvider.System;
    private KeyboardLayoutLease? pending;
    public KeyboardLayoutFault? pendingRestoration => Volatile.Read(ref pending) is null ? null
        : new("KEYBOARD_LAYOUT_RESTORE_FAILED", "SpellBook could not confirm the previous game keyboard layout. Retry restoration before sending commands.");
    internal int inputSettleMs => options.CurrentValue.KeyboardLayouts.InputSettleMs;

    public async Task<KeyboardLayoutLease> acquire(GameProcessInfo game, string layoutId, Action check, CancellationToken token)
    {
        await scope.WaitAsync(token);
        KeyboardLayoutLease? lease = null;
        try
        {
            if (pending is not null) throw new KeyboardLayoutException("KEYBOARD_LAYOUT_RESTORE_FAILED", pendingRestoration!.Message);
            check();
            var original = api.read(game);
            var selected = layoutId == "detect" ? original.LayoutId : layoutId.ToUpperInvariant();
            var info = api.getInstalled().SingleOrDefault(layout => layout.Id.Equals(selected, StringComparison.OrdinalIgnoreCase))
                ?? throw new KeyboardLayoutException("KEYBOARD_LAYOUT_UNAVAILABLE", "The selected keyboard layout is not configured.");
            lease = new(this, game, original, info);
            if (!lease.changed) return lease;
            heldControlsCheck();
            check();
            api.request(original, selected);
            lease.posted = true;
            lease.switchObserved = api.read(game).LayoutId == selected;
            await waitFor(lease, selected, options.CurrentValue.KeyboardLayouts.SwitchTimeoutMs, check, token, true);
            lease.switchObserved = true;
            return lease;
        }
        catch
        {
            if (lease?.posted == true)
            {
                using var cleanup = new CancellationTokenSource(options.CurrentValue.KeyboardLayouts.CleanupBudgetMs);
                await restoreOwned(lease, cleanup.Token);
            }
            scope.Release();
            throw;
        }
    }

    internal void check(KeyboardLayoutLease lease)
    {
        var current = api.read(lease.game);
        if (!sameOwner(current, lease.original) || current.LayoutId != lease.detectedLayout.Id)
            throw new KeyboardLayoutException("KEYBOARD_LAYOUT_CHANGED", "The game's keyboard layout changed during console input.");
    }

    internal async Task<OperationResult> restore(KeyboardLayoutLease lease, CancellationToken token)
    {
        try { return await restoreOwned(lease, token); }
        finally { scope.Release(); }
    }

    private async Task<OperationResult> restoreOwned(KeyboardLayoutLease lease, CancellationToken token, bool retry = false)
    {
        if (!lease.posted) return OperationResult.Success();
        var released = keyboard.releaseAll();
        if (!released.Ok) { pending = lease; return OperationResult.Failure("KEYBOARD_LAYOUT_RESTORE_FAILED", released.ErrorMessage!); }
        try
        {
            GameKeyboardLayout current;
            try { current = api.read(lease.game); }
            catch (KeyboardLayoutException exception) when (exception.code == "KEYBOARD_LAYOUT_CHANGED") { pending = null; return OperationResult.Success(); }
            if (!sameOwner(current, lease.original)) { pending = null; return OperationResult.Success(); }
            if (current.LayoutId != lease.original.LayoutId && current.LayoutId != lease.detectedLayout.Id)
            { pending = null; return OperationResult.Success(); }
            api.request(lease.original, lease.original.LayoutId);
            await waitFor(lease, lease.original.LayoutId, options.CurrentValue.KeyboardLayouts.RestoreTimeoutMs, () => { }, token, false);
            if (!lease.switchObserved && !retry)
                throw new KeyboardLayoutException("KEYBOARD_LAYOUT_RESTORE_FAILED", "The timed-out switch may still be pending. Retry restoration.");
            pending = null;
            return OperationResult.Success();
        }
        catch (Exception exception)
        {
            pending = lease;
            return OperationResult.Failure("KEYBOARD_LAYOUT_RESTORE_FAILED", exception.Message);
        }
    }

    public async Task<OperationResult> retryRestore(Action check, CancellationToken token)
    {
        await scope.WaitAsync(token);
        try
        {
            if (pending is not { } lease) return OperationResult.Success();
            check();
            heldControlsCheck();
            return await restoreOwned(lease, token, true);
        }
        finally { scope.Release(); }
    }

    private void heldControlsCheck()
    {
        var held = input.diagnostics();
        if (!input.snapshot(0).Available || held.HeldKeys.Count > 0 || held.HeldButtons.Count > 0)
            throw new KeyboardLayoutException("KEYBOARD_LAYOUT_SWITCH_FAILED", "Release keyboard and mouse controls before changing the game layout.");
    }

    private async Task waitFor(KeyboardLayoutLease lease, string selected, int timeoutMs, Action check, CancellationToken token, bool acquiring)
    {
        var started = clock.GetTimestamp();
        var matching = 0;
        while (clock.GetElapsedTime(started).TotalMilliseconds < timeoutMs)
        {
            token.ThrowIfCancellationRequested();
            check();
            var current = api.read(lease.game);
            if (!sameOwner(current, lease.original)) throw new KeyboardLayoutException("KEYBOARD_LAYOUT_CHANGED", "The game window changed.");
            if (current.LayoutId == lease.detectedLayout.Id) lease.switchObserved = true;
            if (current.LayoutId != lease.original.LayoutId && current.LayoutId != lease.detectedLayout.Id)
                throw new KeyboardLayoutException("KEYBOARD_LAYOUT_CHANGED", "The keyboard layout changed during the request.");
            matching = current.LayoutId == selected ? matching + 1 : 0;
            if (matching >= options.CurrentValue.KeyboardLayouts.MatchingReads) return;
            await Task.Delay(TimeSpan.FromMilliseconds(options.CurrentValue.KeyboardLayouts.PollMs), clock, token);
        }
        throw new KeyboardLayoutException(acquiring ? "KEYBOARD_LAYOUT_SWITCH_FAILED" : "KEYBOARD_LAYOUT_RESTORE_FAILED", "The game did not confirm the keyboard layout request in time.");
    }

    private static bool sameOwner(GameKeyboardLayout left, GameKeyboardLayout right) =>
        left.ProcessId == right.ProcessId && left.WindowHandle == right.WindowHandle && left.ThreadId == right.ThreadId;
}
