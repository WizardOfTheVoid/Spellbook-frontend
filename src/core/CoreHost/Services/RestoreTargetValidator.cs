using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using CoreHost.Models;
using CoreHost.Win32;

namespace CoreHost.Services;

public sealed class RestoreTargetValidator(IWindowApi windowApi)
{
    private const string InvalidCode = "INVALID_RESTORE_TARGET";
    private const string InactiveCode = "RESTORE_TARGET_INACTIVE";
    private static readonly Regex WindowHandlePattern = new(
        @"\A0x[0-9A-Fa-f]{1,16}\z",
        RegexOptions.CultureInvariant);

    public RestoreTargetValidationResult Validate(JsonElement? request)
    {
        var resolved = Resolve(request);
        return !resolved.Ok || resolved.Target is null
            ? resolved
            : ValidateForeground(resolved.Target);
    }

    public RestoreTargetValidationResult Resolve(JsonElement? request)
    {
        if (request is not { ValueKind: JsonValueKind.Object } restoreTarget ||
            !restoreTarget.TryGetProperty("processId", out var processIdElement) ||
            !restoreTarget.TryGetProperty("windowHandle", out var windowHandleElement) ||
            !TryGetProcessId(processIdElement, out var processId) ||
            !TryGetWindowHandle(windowHandleElement, out var windowHandleText))
        {
            return Invalid("A restore target with a positive process ID and window handle is required.");
        }

        if (!WindowHandlePattern.IsMatch(windowHandleText))
        {
            return Invalid("The restore target window handle must use 0x followed by 1 to 16 hexadecimal digits.");
        }

        var handleText = windowHandleText.AsSpan(2);
        if (!ulong.TryParse(handleText, NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture, out var handleValue) ||
            handleValue == 0 ||
            !FitsInIntPtr(handleValue))
        {
            return Invalid("The restore target window handle is outside the current process pointer range.");
        }

        var windowHandle = IntPtr.Size == 8
            ? new IntPtr(unchecked((long)handleValue))
            : new IntPtr(unchecked((int)handleValue));

        return ValidateOwned(new ValidatedRestoreTarget(processId, windowHandle));
    }

    public RestoreTargetValidationResult Validate(ValidatedRestoreTarget target)
    {
        var owned = ValidateOwned(target);
        return !owned.Ok
            ? owned
            : ValidateForeground(target);
    }

    public RestoreTargetValidationResult ValidateOwned(ValidatedRestoreTarget target)
    {
        if (!windowApi.IsWindow(target.WindowHandle))
        {
            return Invalid("The restore target window no longer exists.");
        }

        if (!HasMatchingOwner(target))
        {
            return Invalid("The restore target window is not owned by the requested process.");
        }

        if (!windowApi.IsWindowVisible(target.WindowHandle))
        {
            return Inactive("The restore target window is not visible.");
        }

        return new RestoreTargetValidationResult(true, target, null, null);
    }

    private RestoreTargetValidationResult ValidateForeground(ValidatedRestoreTarget target)
    {
        return windowApi.GetForegroundWindow() == target.WindowHandle
            ? new RestoreTargetValidationResult(true, target, null, null)
            : Inactive("The restore target window is no longer foreground.");
    }

    public bool IsStillOwnedWindow(ValidatedRestoreTarget target)
    {
        return windowApi.IsWindow(target.WindowHandle) &&
            HasMatchingOwner(target) &&
            windowApi.IsWindowVisible(target.WindowHandle);
    }

    private bool HasMatchingOwner(ValidatedRestoreTarget target)
    {
        var threadId = windowApi.GetWindowThreadProcessId(target.WindowHandle, out var ownerProcessId);
        return threadId != 0 && ownerProcessId == unchecked((uint)target.ProcessId);
    }

    private static bool FitsInIntPtr(ulong handleValue)
    {
        return IntPtr.Size == 8 || handleValue <= uint.MaxValue;
    }

    private static bool TryGetProcessId(JsonElement value, out int processId)
    {
        processId = 0;
        return value.ValueKind == JsonValueKind.Number &&
            value.TryGetInt32(out processId) &&
            processId > 0;
    }

    private static bool TryGetWindowHandle(JsonElement value, out string windowHandle)
    {
        windowHandle = string.Empty;
        if (value.ValueKind != JsonValueKind.String)
        {
            return false;
        }

        windowHandle = value.GetString() ?? string.Empty;
        return !string.IsNullOrWhiteSpace(windowHandle);
    }

    private static RestoreTargetValidationResult Invalid(string message)
    {
        return new RestoreTargetValidationResult(false, null, InvalidCode, message);
    }

    private static RestoreTargetValidationResult Inactive(string message)
    {
        return new RestoreTargetValidationResult(false, null, InactiveCode, message);
    }
}
