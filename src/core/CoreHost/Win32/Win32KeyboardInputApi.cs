using System.Runtime.InteropServices;

namespace CoreHost.Win32;

public sealed class Win32KeyboardInputApi : IKeyboardInputApi
{
    public KeyboardInputSendResult Send(IReadOnlyList<KeyboardInputEvent> inputs)
    {
        if (inputs.Count == 0)
        {
            return new KeyboardInputSendResult(0, 0);
        }

        var nativeInputs = inputs.Select(ToNativeInput).ToArray();
        var sent = NativeMethods.SendInput(
            (uint)nativeInputs.Length,
            nativeInputs,
            Marshal.SizeOf<NativeMethods.INPUT>());
        var error = Marshal.GetLastWin32Error();
        return new KeyboardInputSendResult(sent, error);
    }

    private static NativeMethods.INPUT ToNativeInput(KeyboardInputEvent input)
    {
        return new NativeMethods.INPUT
        {
            type = NativeMethods.INPUT_KEYBOARD,
            U = new NativeMethods.InputUnion
            {
                ki = new NativeMethods.KEYBDINPUT
                {
                    wVk = input.VirtualKey,
                    wScan = input.ScanCode,
                    dwFlags = input.Flags
                }
            }
        };
    }
}
