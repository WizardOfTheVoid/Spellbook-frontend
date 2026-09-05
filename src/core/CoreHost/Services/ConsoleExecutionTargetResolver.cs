using System.Text.Json;
using CoreHost.Models;

namespace CoreHost.Services;

public interface IConsoleExecutionTargetResolver
{
    RestoreTargetValidationResult Resolve(JsonElement? restoreTarget, bool background);

    RestoreTargetValidationResult Validate(
        ValidatedRestoreTarget target,
        bool requireForeground);

    RestoreTargetValidationResult ResolveGameTarget(
        ValidatedRestoreTarget leaseTarget,
        bool background);
}

public sealed class ConsoleExecutionTargetResolver(
    IGameProcessTargetLocator gameProcess,
    RestoreTargetValidator restoreTargetValidator) : IConsoleExecutionTargetResolver
{
    public RestoreTargetValidationResult Resolve(
        JsonElement? restoreTarget,
        bool background)
    {
        return background
            ? ResolveConfiguredGame(validateOwned: true)
            : restoreTargetValidator.Resolve(restoreTarget);
    }

    public RestoreTargetValidationResult Validate(
        ValidatedRestoreTarget target,
        bool requireForeground)
    {
        return requireForeground
            ? restoreTargetValidator.Validate(target)
            : restoreTargetValidator.ValidateOwned(target);
    }

    public RestoreTargetValidationResult ResolveGameTarget(
        ValidatedRestoreTarget leaseTarget,
        bool background)
    {
        return background
            ? Success(leaseTarget)
            : ResolveConfiguredGame(validateOwned: false);
    }

    private RestoreTargetValidationResult ResolveConfiguredGame(bool validateOwned)
    {
        var lookup = gameProcess.GetTargetProcess();
        if (!lookup.Success || lookup.Process is null)
        {
            return new RestoreTargetValidationResult(
                false,
                null,
                lookup.ErrorCode ?? "GAME_NOT_RUNNING",
                lookup.ErrorMessage ?? "No configured Chivalry 2 process is running.");
        }

        var target = new ValidatedRestoreTarget(
            lookup.Process.Id,
            lookup.Process.WindowHandle);
        return validateOwned
            ? restoreTargetValidator.ValidateOwned(target)
            : Success(target);
    }

    private static RestoreTargetValidationResult Success(ValidatedRestoreTarget target)
    {
        return new RestoreTargetValidationResult(true, target, null, null);
    }
}
