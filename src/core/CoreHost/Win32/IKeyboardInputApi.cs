namespace CoreHost.Win32;

public readonly record struct KeyboardInputEvent(ushort VirtualKey, ushort ScanCode, uint Flags);

public readonly record struct KeyboardInputSendResult(uint Sent, int Error);

public interface IKeyboardInputApi
{
    KeyboardInputSendResult Send(IReadOnlyList<KeyboardInputEvent> inputs);
}
