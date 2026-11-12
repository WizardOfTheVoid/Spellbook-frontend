using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Tests.Clipboard;

public sealed class ClipboardServiceTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task cancellationStopsBeforeAnotherOpenAttempt(bool writing)
    {
        using var cancellation = new CancellationTokenSource();
        var native = new Clipboard();
        native.TryOpen = () =>
        {
            if (native.Attempts > 1) throw new OperationCanceledException(cancellation.Token);
            cancellation.Cancel();
            return false;
        };
        var service = new ClipboardService(native);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => writing
            ? service.SetTextAsync("command", cancellation.Token)
            : (Task)service.ReadTextAsync(cancellation.Token));

        Assert.Equal(1, native.Attempts);
        Assert.False(native.Opened);
    }

    [Fact]
    public async Task cancellationAfterOpeningClosesWithoutWriting()
    {
        using var cancellation = new CancellationTokenSource();
        var native = new Clipboard { TryOpen = () => { cancellation.Cancel(); return true; } };
        var service = new ClipboardService(native);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => service.SetTextAsync("command", cancellation.Token));

        Assert.Equal("original", native.Text);
        Assert.False(native.Opened);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task retryBudgetDoesNotMultiplyOpenAttempts(bool writing)
    {
        var native = new Clipboard();
        native.TryOpen = () => native.Attempts > 50 ? throw new ApplicationException("Nested retry attempted") : false;
        var service = new ClipboardService(native, new Clock { Immediate = true });

        var ok = writing
            ? (await service.SetTextAsync("command", TestContext.Current.CancellationToken)).Ok
            : (await service.ReadTextAsync(TestContext.Current.CancellationToken)).Ok;

        Assert.False(ok);
        Assert.Equal(50, native.Attempts);
        Assert.Equal("original", native.Text);
    }

    [Fact]
    public async Task busyClipboardWaitYieldsAndCanBeCancelled()
    {
        var native = new Clipboard();
        native.TryOpen = () => native.Attempts > 1 ? throw new ApplicationException("Retried without advancing clock") : false;
        var clock = new Clock();
        var service = new ClipboardService(native, clock);
        using var cancellation = new CancellationTokenSource();

        var pending = service.ReadTextAsync(cancellation.Token);

        Assert.False(pending.IsCompleted);
        cancellation.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => pending);
        Assert.Equal(1, native.Attempts);
    }

    [Fact]
    public async Task conditionalWriteChecksSequenceWhileClipboardIsOpen()
    {
        var native = new Clipboard { Sequence = 10 };
        native.TryOpen = () => { native.Sequence = 11; return true; };
        var service = new ClipboardService(native);

        var result = await service.SetTextAsync("old saved text", TestContext.Current.CancellationToken, expectedSequence: 10);

        Assert.False(result.Ok);
        Assert.Equal("CLIPBOARD_CHANGED", result.ErrorCode);
        Assert.Equal("original", native.Text);
        Assert.False(native.Opened);
    }

    [Fact]
    public async Task conditionalWriteSucceedsWhenSequenceMatches()
    {
        var native = new Clipboard { Sequence = 10, TryOpen = () => true };
        var service = new ClipboardService(native);

        var result = await service.SetTextAsync("saved text", TestContext.Current.CancellationToken, expectedSequence: 10);

        Assert.True(result.Ok);
        Assert.Equal("saved text", native.Text);
        Assert.False(native.Opened);
    }

    [Fact]
    public async Task completedOperationsCloseClipboardAndPreserveText()
    {
        var native = new Clipboard { TryOpen = () => true };
        var service = new ClipboardService(native);

        Assert.Equal("original", (await service.ReadTextAsync(TestContext.Current.CancellationToken)).Text);
        Assert.False(native.Opened);
        Assert.True((await service.SetTextAsync("command", TestContext.Current.CancellationToken)).Ok);
        Assert.Equal("command", native.Text);
        Assert.False(native.Opened);
    }

    private sealed class Clipboard : IClipboardNativeApi
    {
        internal Func<bool> TryOpen = () => false;
        internal int Attempts;
        internal bool Opened;
        internal uint Sequence = 1;
        internal string Text = "original";
        public uint sequence() => Sequence;
        public bool open() { Attempts++; return Opened = TryOpen(); }
        public void close() => Opened = false;
        public ClipboardTextResult read() => ClipboardTextResult.TextValue(Text);
        public void write(string text) => Text = text;
    }

    private sealed class Clock : TimeProvider
    {
        internal bool Immediate;
        public override ITimer CreateTimer(TimerCallback callback, object? state, TimeSpan dueTime, TimeSpan period)
        {
            if (Immediate) callback(state);
            return new Timer();
        }
        private sealed class Timer : ITimer
        {
            public bool Change(TimeSpan dueTime, TimeSpan period) => true;
            public void Dispose() { }
            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }
}
