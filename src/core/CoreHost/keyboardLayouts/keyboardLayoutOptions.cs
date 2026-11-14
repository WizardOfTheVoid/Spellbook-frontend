namespace CoreHost.KeyboardLayouts;

public sealed class KeyboardLayoutOptions
{
    public int SwitchTimeoutMs { get; set; } = 1000;
    public int RestoreTimeoutMs { get; set; } = 1000;
    public int PollMs { get; set; } = 10;
    public int MatchingReads { get; set; } = 2;
    public int InputSettleMs { get; set; } = 200;
    public int CleanupBudgetMs { get; set; } = 3000;
}
