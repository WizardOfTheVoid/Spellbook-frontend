using System.Text.Json;
using CoreHost.Models;

namespace CoreHost.Services;

public sealed record ConsoleCommandSubmitResult(
    OperationResult Operation,
    bool EnterSent,
    bool Cancelled);

public interface IConsoleBatchRuntime
{
    RestoreTargetValidationResult ResolveExecutionTarget(
        JsonElement? restoreTarget,
        bool background);

    RestoreTargetValidationResult ValidateExecutionTarget(
        ValidatedRestoreTarget restoreTarget,
        bool requireForeground);

    Task<OperationResult> FocusGameAsync(
        ValidatedRestoreTarget leaseTarget,
        bool background,
        CancellationToken cancellationToken);

    Task<ConsoleCommandSubmitResult> SubmitAsync(
        PreparedConsoleCommand command,
        ConsoleOpenAttemptState attempt,
        CancellationToken cancellationToken);

    Task<ConsoleExecutionResult> CompleteAsync(
        ConsoleExecutionResult result,
        ConsoleOpenAttemptState attempt,
        ValidatedRestoreTarget restoreTarget,
        bool restoreForeground);
}
