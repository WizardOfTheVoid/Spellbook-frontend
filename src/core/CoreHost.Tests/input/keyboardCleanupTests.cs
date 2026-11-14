using CoreHost.Input;
using CoreHost.Win32;

namespace CoreHost.Tests.Input;

public sealed class KeyboardCleanupTests
{
    [Fact]
    public async Task rejectedKeyDownNeverSendsKeyUp()
    {
        var native = new Keyboard { Results = new([new(0, 5)]) };
        var input = new KeyboardInput(native);

        await Assert.ThrowsAsync<InputException>(() => input.hold(87, 0, () => { }, TestContext.Current.CancellationToken));

        Assert.Single(native.Batches);
        Assert.Empty(native.Held);
    }

    [Fact]
    public void failedRollbackReportsBothFailuresAndRetainsKeysForLaterCleanup()
    {
        var native = new Keyboard { Results = new([new(2, 5), new(0, 32), new(0, 32)]) };
        var input = new KeyboardInput(native);

        var error = Assert.Throws<InputException>(input.paste);

        Assert.Contains("2/4", error.Message);
        Assert.Contains("5", error.Message);
        Assert.Contains("release", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("32", error.Message);
        Assert.Equal(2, native.Held.Count);
        Assert.True(input.releaseAll().Ok);
        Assert.Empty(native.Held);
    }

    [Fact]
    public void releaseAllRetriesOnlyKeysStillHeldAfterPartialRelease()
    {
        var native = new Keyboard { Results = new([new(2, 5), new(0, 32), new(0, 32), new(1, 32), new(1, 0)]) };
        var input = new KeyboardInput(native);
        Assert.Throws<InputException>(input.paste);

        var result = input.releaseAll();

        Assert.True(result.Ok);
        Assert.Empty(native.Held);
        Assert.Equal([17], native.Batches[^1].Select(item => (int)item.VirtualKey));
    }

    [Fact]
    public void releaseAllReportsPersistentFailureWithoutForgettingOwnership()
    {
        var native = new Keyboard { Results = new([new(1, 5), new(0, 32), new(0, 32), new(0, 87), new(0, 87)]) };
        var input = new KeyboardInput(native);
        Assert.Throws<InputException>(() => input.enter(() => { }));

        var result = input.releaseAll();

        Assert.False(result.Ok);
        Assert.Equal("INPUT_RELEASE_FAILED", result.ErrorCode);
        Assert.Contains("87", result.ErrorMessage);
        Assert.Single(native.Held);
        Assert.True(input.releaseAll().Ok);
        Assert.Empty(native.Held);
    }

    [Fact]
    public async Task cancelledHoldPreservesCancellationAndReleaseFailure()
    {
        var native = new Keyboard { Results = new([new(1, 0), new(0, 32), new(0, 32)]) };
        var input = new KeyboardInput(native);
        using var cancellation = new CancellationTokenSource();

        var error = await Assert.ThrowsAnyAsync<OperationCanceledException>(() => input.hold(87, 100, cancellation.Cancel, cancellation.Token));

        Assert.Contains("release", error.Message, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("32", error.Message);
        Assert.Single(native.Held);
        Assert.True(input.releaseAll().Ok);
        Assert.Empty(native.Held);
    }

    [Fact]
    public void completedKeystrokesLeaveNothingToRelease()
    {
        var native = new Keyboard();
        var input = new KeyboardInput(native);
        input.paste();

        Assert.True(input.releaseAll().Ok);

        Assert.Single(native.Batches);
        Assert.Empty(native.Held);
    }

    private sealed class Keyboard : IKeyboardInputApi
    {
        internal Queue<KeyboardInputSendResult> Results { get; init; } = new();
        internal List<KeyboardInputEvent[]> Batches { get; } = [];
        internal HashSet<ushort> Held { get; } = [];

        public KeyboardInputSendResult Send(IReadOnlyList<KeyboardInputEvent> inputs)
        {
            Batches.Add(inputs.ToArray());
            var result = Results.TryDequeue(out var next) ? next : new((uint)inputs.Count, 0);
            foreach (var input in inputs.Take((int)result.Sent))
            {
                if ((input.Flags & 2) == 0) Held.Add(input.VirtualKey);
                else Held.Remove(input.VirtualKey);
            }
            return result;
        }
    }
}
