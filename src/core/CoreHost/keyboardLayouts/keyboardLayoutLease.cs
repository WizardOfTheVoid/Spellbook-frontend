using CoreHost.Models;

namespace CoreHost.KeyboardLayouts;

public sealed class KeyboardLayoutLease
{
    private readonly KeyboardLayoutService service;
    internal readonly GameProcessInfo game;
    internal readonly GameKeyboardLayout original;
    internal bool posted, switchObserved;
    private Task<OperationResult>? restoration;
    public KeyboardLayoutInfo detectedLayout { get; }
    public bool changed => original.LayoutId != detectedLayout.Id;
    public int inputSettleMs => changed ? service.inputSettleMs : 0;

    internal KeyboardLayoutLease(KeyboardLayoutService service, GameProcessInfo game, GameKeyboardLayout original, KeyboardLayoutInfo selected)
    { this.service = service; this.game = game; this.original = original; detectedLayout = selected; }

    public void check() => service.check(this);
    public async Task<OperationResult> restore(CancellationToken cleanupToken)
    {
        restoration ??= service.restore(this, cleanupToken);
        return await restoration;
    }
}
