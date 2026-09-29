using CoreHost.Actions;
using CoreHost.Models;

namespace CoreHost.Execution;

public sealed record ExecutionEligibility(bool Allowed, string? Reason = null, bool Unavailable = false);
public interface IActionRuntime
{
    void refresh();
    ExecutionEligibility eligibility(CoreActionRequest action);
    Task<OperationResult> prepare(QueuedAction action, CancellationToken token);
    Task<CommandOutcome> execute(QueuedAction action, CoreCommand command, Action submitted, CancellationToken token);
    Task<IReadOnlyList<string>> cleanup(CancellationToken token);
}
