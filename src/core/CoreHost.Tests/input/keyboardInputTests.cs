using CoreHost.Input;
using CoreHost.Win32;

namespace CoreHost.Tests.Input;

public sealed class KeyboardInputTests
{
    [Fact]
    public void enterRecordsSubmissionEvenWhenKeyReleaseFails()
    {
        var native = new Native { Limit = 1 };
        var input = new KeyboardInput(native);
        var submitted = 0;
        Assert.Throws<InputException>(() => input.enter(() => submitted++));
        Assert.Equal(1, submitted);
        Assert.Contains(native.Events, item => item.VirtualKey == 13 && item.Flags == 2);
    }

    [Fact]
    public async Task cancellationReleasesOwnedKey()
    {
        var native = new Native();
        var input = new KeyboardInput(native);
        using var cancellation = new CancellationTokenSource();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => input.hold(87, 100,
            () => cancellation.Cancel(), cancellation.Token));
        Assert.Equal(2u, native.Events.Last().Flags);
    }

    [Fact]
    public void openUsesSuppliedPhysicalKey()
    {
        var native = new Native();
        new KeyboardInput(native).open("NumpadSubtract");
        Assert.All(native.Events, item => Assert.Equal(74, item.ScanCode));
    }

    private sealed class Native : IKeyboardInputApi
    {
        public int Limit { get; init; } = int.MaxValue;
        public List<KeyboardInputEvent> Events { get; } = [];
        public KeyboardInputSendResult Send(IReadOnlyList<KeyboardInputEvent> inputs)
        {
            Events.AddRange(inputs);
            return new((uint)Math.Min(Limit, inputs.Count), 0);
        }
    }
}
