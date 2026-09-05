using CoreHost.Models;
using CoreHost.Options;

namespace CoreHost.Services;

public interface IConsoleCleanupInput
{
    Task<OperationResult> SendConsoleCloseSequenceAsync(
        ConsoleAutomationOptions console,
        TimingOptions timing,
        CancellationToken cancellationToken);
}
