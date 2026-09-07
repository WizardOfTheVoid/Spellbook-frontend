namespace CoreHost.Models;

public sealed record ValidatedRestoreTarget(int ProcessId, IntPtr WindowHandle);

public sealed record RestoreTargetValidationResult(
    bool Ok,
    ValidatedRestoreTarget? Target,
    string? ErrorCode,
    string? ErrorMessage);
