using CoreHost.Win32;

namespace CoreHost.Tests.Fakes;

public sealed class FakeKeyboardInputApi : IKeyboardInputApi
{
    public uint? Sent { get; init; }

    public int Error { get; init; }

    public Action<int>? OnSend { get; init; }

    public int SendCalls { get; private set; }

    public List<IReadOnlyList<KeyboardInputEvent>> InputBatches { get; } = [];

    public KeyboardInputSendResult Send(IReadOnlyList<KeyboardInputEvent> inputs)
    {
        SendCalls++;
        InputBatches.Add(inputs.ToArray());
        OnSend?.Invoke(SendCalls);
        return new KeyboardInputSendResult(Sent ?? (uint)inputs.Count, Error);
    }
}
