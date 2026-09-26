namespace CoreHost.Options;

internal static class RuntimeOptions
{
    public static bool valid(CoreHostOptions options) =>
        options.Window.FocusTimeoutMs > 0 && options.Window.ProcessPollMs > 0 &&
        options.Window.FocusSettleMs >= 0 && options.Window.RestoreSettleMs >= 0 &&
        options.QueueGateNormal >= 0 && options.QueueGateLow >= 0 && options.QueueGateHigh >= 0 &&
        options.Input.SubmitSettleMs >= 0 && options.Input.ChatCooldownMs > 0 &&
        options.Queue.UserActionTtlMs > 0 && options.Queue.SystemActionTtlMs > 0 &&
        options.Queue.CommandTimeoutMs > 0 && options.Queue.RecheckMs > 0 &&
        options.Queue.MaxPendingActions > 0 && options.Clipboard.OutputTimeoutMs > 0 && options.Clipboard.PollMs > 0 &&
        options.Debug.EventLimit is >= 10 and <= 10000 && options.Debug.SessionLeaseMs is >= 100 and <= 10000;
}

public sealed class DebugOptions
{
    public int EventLimit { get; set; } = 500;
    public int SessionLeaseMs { get; set; } = 2000;
}

public sealed class WindowOptions
{
    public int FocusTimeoutMs { get; set; } = 600;
    public int FocusSettleMs { get; set; } = 30;
    public int RestoreSettleMs { get; set; } = 50;
    public int ProcessPollMs { get; set; } = 1000;
}
public sealed class InputOptions
{
    public int SubmitSettleMs { get; set; } = 20;
    public int ChatCooldownMs { get; set; } = 25000;
}
public sealed class QueueOptions
{
    public int UserActionTtlMs { get; set; } = 30000;
    public int SystemActionTtlMs { get; set; } = 15000;
    public int CommandTimeoutMs { get; set; } = 5000;
    public int RecheckMs { get; set; } = 25;
    public int MaxPendingActions { get; set; } = 999;
}
public sealed class ClipboardOptions
{
    public int OutputTimeoutMs { get; set; } = 3000;
    public int PollMs { get; set; } = 1;
}
