using CoreHost.Models;
using CoreHost.Options;
using CoreHost.Win32;

namespace CoreHost.Services;

public sealed class SendInputService(IKeyboardInputApi inputApi) : IConsoleCleanupInput
{
    public async Task<OperationResult> SendConsoleOpenSequenceAsync(
        ConsoleAutomationOptions console,
        TimingOptions timing,
        ConsoleOpenAttemptState attemptState,
        CancellationToken cancellationToken)
    {
        return await SendConfiguredKeySequenceAsync(
            console.OpenMode,
            isOpenSequence: true,
            timing,
            attemptState,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<OperationResult> SendConsoleCloseSequenceAsync(ConsoleAutomationOptions console, TimingOptions timing, CancellationToken cancellationToken)
    {
        return await SendConfiguredKeySequenceAsync(
            console.CloseMode,
            isOpenSequence: false,
            timing,
            attemptState: null,
            cancellationToken).ConfigureAwait(false);
    }

    public async Task<OperationResult> PressEnterAsync(
        TimingOptions timing,
        ConsoleOpenAttemptState attemptState,
        CancellationToken cancellationToken)
    {
        var result = SendInputs(
            CreateVirtualKeyInputs(NativeMethods.VK_RETURN),
            attemptState,
            marksCommandSubmitted: true);
        if (!result.Ok)
        {
            return result;
        }

        await DelayBetweenKeysAsync(timing.AfterActionMs, CancellationToken.None).ConfigureAwait(false);
        await DelayBetweenKeysAsync(timing.BetweenKeyDelayMs, cancellationToken).ConfigureAwait(false);
        return OperationResult.Success();
    }

    public async Task<OperationResult> PressPasteAsync(TimingOptions timing, CancellationToken cancellationToken)
    {
        var result = SendInputs(CreateVirtualKeyChordInputs(NativeMethods.VK_CONTROL, NativeMethods.VK_V));
        if (!result.Ok)
        {
            return result;
        }

        await DelayBetweenKeysAsync(timing.BetweenKeyDelayMs, cancellationToken).ConfigureAwait(false);
        return OperationResult.Success();
    }

    public async Task<OperationResult> PressVirtualKeyAsync(
        ushort virtualKey,
        int durationMs,
        CancellationToken cancellationToken)
    {
        if (durationMs <= 0)
        {
            return SendInputs(CreateVirtualKeyInputs(virtualKey));
        }

        var keyDown = SendInputs([CreateVirtualKeyInput(virtualKey, keyUp: false)]);
        if (!keyDown.Ok)
        {
            return keyDown;
        }

        OperationResult keyUp;
        try
        {
            await DelayBetweenKeysAsync(durationMs, cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            keyUp = SendInputs([CreateVirtualKeyInput(virtualKey, keyUp: true)]);
        }

        return keyUp;
    }

    public async Task<OperationResult> SendUnicodeTextAsync(string text, TimingOptions timing, CancellationToken cancellationToken)
    {
        foreach (var character in text)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = SendInputs(CreateUnicodeInputs(character));
            if (!result.Ok)
            {
                return result;
            }

            await DelayBetweenKeysAsync(timing.BetweenKeyDelayMs, cancellationToken).ConfigureAwait(false);
        }

        return OperationResult.Success();
    }

    private async Task<OperationResult> SendConfiguredKeySequenceAsync(
        string mode,
        bool isOpenSequence,
        TimingOptions timing,
        ConsoleOpenAttemptState? attemptState,
        CancellationToken cancellationToken)
    {
        if (mode.Equals("None", StringComparison.OrdinalIgnoreCase))
        {
            return OperationResult.Success();
        }

        if (mode.Equals("TildeOnce", StringComparison.OrdinalIgnoreCase))
        {
            return await SendVirtualKeyAsync(NativeMethods.VK_OEM_3, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("GraveScanCodeOnce", StringComparison.OrdinalIgnoreCase))
        {
            return await SendScanCodeAsync(NativeMethods.SC_GRAVE, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("GraveScanCodeTwice", StringComparison.OrdinalIgnoreCase))
        {
            var first = await SendScanCodeAsync(NativeMethods.SC_GRAVE, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
            if (!first.Ok)
            {
                return first;
            }

            return await SendScanCodeAsync(NativeMethods.SC_GRAVE, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("NumpadSubtractOnce", StringComparison.OrdinalIgnoreCase))
        {
            return await SendVirtualKeyAsync(NativeMethods.VK_SUBTRACT, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("MinusOnce", StringComparison.OrdinalIgnoreCase) || mode.Equals("OemMinusOnce", StringComparison.OrdinalIgnoreCase))
        {
            return await SendVirtualKeyAsync(NativeMethods.VK_OEM_MINUS, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("NumpadSubtractScanCodeOnce", StringComparison.OrdinalIgnoreCase))
        {
            return await SendScanCodeAsync(NativeMethods.SC_NUMPAD_SUBTRACT, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("MinusScanCodeOnce", StringComparison.OrdinalIgnoreCase) || mode.Equals("OemMinusScanCodeOnce", StringComparison.OrdinalIgnoreCase))
        {
            return await SendScanCodeAsync(NativeMethods.SC_MINUS, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("NumpadSubtractTwice", StringComparison.OrdinalIgnoreCase))
        {
            var first = await SendVirtualKeyAsync(NativeMethods.VK_SUBTRACT, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
            if (!first.Ok)
            {
                return first;
            }

            return await SendVirtualKeyAsync(NativeMethods.VK_SUBTRACT, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("MinusTwice", StringComparison.OrdinalIgnoreCase) || mode.Equals("OemMinusTwice", StringComparison.OrdinalIgnoreCase))
        {
            var first = await SendVirtualKeyAsync(NativeMethods.VK_OEM_MINUS, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
            if (!first.Ok)
            {
                return first;
            }

            return await SendVirtualKeyAsync(NativeMethods.VK_OEM_MINUS, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("NumpadSubtractScanCodeTwice", StringComparison.OrdinalIgnoreCase))
        {
            var first = await SendScanCodeAsync(NativeMethods.SC_NUMPAD_SUBTRACT, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
            if (!first.Ok)
            {
                return first;
            }

            return await SendScanCodeAsync(NativeMethods.SC_NUMPAD_SUBTRACT, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        if (mode.Equals("MinusScanCodeTwice", StringComparison.OrdinalIgnoreCase) || mode.Equals("OemMinusScanCodeTwice", StringComparison.OrdinalIgnoreCase))
        {
            var first = await SendScanCodeAsync(NativeMethods.SC_MINUS, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
            if (!first.Ok)
            {
                return first;
            }

            return await SendScanCodeAsync(NativeMethods.SC_MINUS, timing.BetweenKeyDelayMs, cancellationToken, attemptState).ConfigureAwait(false);
        }

        var sequenceName = isOpenSequence ? "open" : "close";
        return OperationResult.Failure("INVALID_REQUEST", $"Unsupported console {sequenceName} mode '{mode}'.");
    }

    private async Task<OperationResult> SendVirtualKeyAsync(
        ushort virtualKey,
        int delayMs,
        CancellationToken cancellationToken,
        ConsoleOpenAttemptState? attemptState = null)
    {
        var result = SendInputs(CreateVirtualKeyInputs(virtualKey), attemptState);
        if (!result.Ok)
        {
            return result;
        }

        await DelayBetweenKeysAsync(delayMs, cancellationToken).ConfigureAwait(false);
        return OperationResult.Success();
    }

    private async Task<OperationResult> SendScanCodeAsync(
        ushort scanCode,
        int delayMs,
        CancellationToken cancellationToken,
        ConsoleOpenAttemptState? attemptState = null)
    {
        var result = SendInputs(CreateScanCodeInputs(scanCode), attemptState);
        if (!result.Ok)
        {
            return result;
        }

        await DelayBetweenKeysAsync(delayMs, cancellationToken).ConfigureAwait(false);
        return OperationResult.Success();
    }

    private static async Task DelayBetweenKeysAsync(int delayMs, CancellationToken cancellationToken)
    {
        if (delayMs > 0)
        {
            await Task.Delay(delayMs, cancellationToken).ConfigureAwait(false);
        }
    }

    private OperationResult SendInputs(
        IReadOnlyList<KeyboardInputEvent> inputs,
        ConsoleOpenAttemptState? attemptState = null,
        bool marksCommandSubmitted = false)
    {
        var send = inputApi.Send(inputs);
        if (send.Sent > 0)
        {
            if (marksCommandSubmitted)
            {
                attemptState?.MarkCommandSubmitted();
            }
            else
            {
                attemptState?.MarkInputSent();
            }
        }

        if (send.Sent == (uint)inputs.Count)
        {
            return OperationResult.Success();
        }

        return OperationResult.Failure(
            "INPUT_FAILED",
            $"SendInput sent {send.Sent} of {inputs.Count} input events. Win32 error: {send.Error}.");
    }

    private static KeyboardInputEvent[] CreateVirtualKeyInputs(ushort virtualKey)
    {
        return
        [
            new KeyboardInputEvent(virtualKey, 0, 0),
            new KeyboardInputEvent(virtualKey, 0, NativeMethods.KEYEVENTF_KEYUP)
        ];
    }

    private static KeyboardInputEvent[] CreateUnicodeInputs(char character)
    {
        return
        [
            new KeyboardInputEvent(0, character, NativeMethods.KEYEVENTF_UNICODE),
            new KeyboardInputEvent(0, character, NativeMethods.KEYEVENTF_UNICODE | NativeMethods.KEYEVENTF_KEYUP)
        ];
    }

    private static KeyboardInputEvent[] CreateVirtualKeyChordInputs(ushort modifierKey, ushort key)
    {
        return
        [
            CreateVirtualKeyInput(modifierKey, keyUp: false),
            CreateVirtualKeyInput(key, keyUp: false),
            CreateVirtualKeyInput(key, keyUp: true),
            CreateVirtualKeyInput(modifierKey, keyUp: true)
        ];
    }

    private static KeyboardInputEvent CreateVirtualKeyInput(ushort virtualKey, bool keyUp)
    {
        return new KeyboardInputEvent(
            virtualKey,
            0,
            keyUp ? NativeMethods.KEYEVENTF_KEYUP : 0);
    }

    private static KeyboardInputEvent[] CreateScanCodeInputs(ushort scanCode)
    {
        return
        [
            new KeyboardInputEvent(0, scanCode, NativeMethods.KEYEVENTF_SCANCODE),
            new KeyboardInputEvent(0, scanCode, NativeMethods.KEYEVENTF_SCANCODE | NativeMethods.KEYEVENTF_KEYUP)
        ];
    }
}
