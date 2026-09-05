using System.Text.Json;
using CoreHost.Models;
using CoreHost.Options;
using Microsoft.Extensions.Options;

namespace CoreHost.Services;

public sealed class KeyPressRuntime(
    IOptionsMonitor<CoreHostOptions> options,
    GameProcessService gameProcess,
    ForegroundWindowService foreground,
    RestoreTargetValidator restoreTargetValidator,
    SendInputService sendInput,
    ConsoleCommandCleanupService cleanup) : IKeyPressRuntime
{
    public RestoreTargetValidationResult ResolveQueueTarget(JsonElement? restoreTarget)
    {
        if (restoreTarget.HasValue)
        {
            return restoreTargetValidator.Resolve(restoreTarget);
        }

        var target = gameProcess.GetTargetProcess();
        if (!target.Success || target.Process is null)
        {
            return new RestoreTargetValidationResult(
                false,
                null,
                target.ErrorCode ?? "GAME_NOT_RUNNING",
                target.ErrorMessage ?? "No configured Chivalry 2 process is running.");
        }

        return new RestoreTargetValidationResult(
            true,
            new ValidatedRestoreTarget(target.Process.Id, target.Process.WindowHandle),
            null,
            null);
    }

    public RestoreTargetValidationResult ValidateQueueTarget(
        ValidatedRestoreTarget restoreTarget,
        bool requireForeground)
    {
        return requireForeground
            ? restoreTargetValidator.Validate(restoreTarget)
            : restoreTargetValidator.ValidateOwned(restoreTarget);
    }

    public async Task<OperationResult> FocusGameAsync(CancellationToken cancellationToken)
    {
        var target = gameProcess.GetTargetProcess();
        if (!target.Success || target.Process is null)
        {
            return OperationResult.Failure(
                target.ErrorCode ?? "GAME_NOT_RUNNING",
                target.ErrorMessage ?? "No configured Chivalry 2 process is running.");
        }

        return await foreground.FocusAndVerifyAsync(
            target.Process.WindowHandle,
            options.CurrentValue.Timing,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<OperationResult> PressVirtualKeyAsync(
        ushort virtualKey,
        int durationMs,
        CancellationToken cancellationToken)
    {
        var result = await sendInput.PressVirtualKeyAsync(
            virtualKey,
            durationMs,
            cancellationToken).ConfigureAwait(false);
        if (result.Ok && options.CurrentValue.Timing.AfterActionMs > 0)
        {
            await Task.Delay(
                options.CurrentValue.Timing.AfterActionMs,
                CancellationToken.None).ConfigureAwait(false);
        }

        return result;
    }

    public Task<ConsoleExecutionResult> CompleteAsync(
        ConsoleExecutionResult result,
        ValidatedRestoreTarget restoreTarget,
        bool restoreRequested)
    {
        return restoreRequested
            ? cleanup.CompleteAsync(
                result,
                consoleMayBeOpen: false,
                commandSubmitted: false,
                restoreTarget)
            : Task.FromResult(result);
    }
}
