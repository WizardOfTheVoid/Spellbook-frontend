using System.Text.Json;
using CoreHost.Models;

namespace CoreHost.Services;

public interface IKeyPressRuntime
{
    RestoreTargetValidationResult ResolveQueueTarget(JsonElement? restoreTarget);

    RestoreTargetValidationResult ValidateQueueTarget(
        ValidatedRestoreTarget restoreTarget,
        bool requireForeground);

    Task<OperationResult> FocusGameAsync(CancellationToken cancellationToken);

    Task<OperationResult> PressVirtualKeyAsync(
        ushort virtualKey,
        int durationMs,
        CancellationToken cancellationToken);

    Task<ConsoleExecutionResult> CompleteAsync(
        ConsoleExecutionResult result,
        ValidatedRestoreTarget restoreTarget,
        bool restoreRequested);
}
