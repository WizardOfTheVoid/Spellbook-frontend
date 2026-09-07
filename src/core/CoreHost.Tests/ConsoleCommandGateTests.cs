using System.Diagnostics;
using CoreHost.Models;
using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class ConsoleCommandGateTests
{
    private static readonly ValidatedRestoreTarget Target = new(42, new IntPtr(0x1234));

    [Fact]
    public async Task EmptyQueueWaitsBeforeClosingTheSession()
    {
        var gate = new ConsoleCommandGate();
        var lease = await gate.WaitAsync(Target, CancellationToken.None);
        var startedAt = Stopwatch.GetTimestamp();
        TimeSpan closeStartedAfter = default;

        await gate.CompleteAsync(
            lease,
            canContinue: true,
            () =>
            {
                closeStartedAfter = Stopwatch.GetElapsedTime(startedAt);
                return Task.FromResult<IReadOnlyList<string>>([]);
            },
            afterQueueEmptyMs: 60);

        Assert.True(
            closeStartedAfter >= TimeSpan.FromMilliseconds(45),
            "Expected the empty-queue delay before session cleanup.");
    }

    [Fact]
    public async Task QueuedWorkSkipsTheEmptyQueueDelayWhenFailureClosesTheSession()
    {
        var gate = new ConsoleCommandGate();
        var first = await gate.WaitAsync(Target, CancellationToken.None);
        var secondWait = gate.WaitAsync(Target, CancellationToken.None);
        var closeStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var firstCompletion = gate.CompleteAsync(
            first,
            canContinue: false,
            () =>
            {
                closeStarted.SetResult();
                return Task.FromResult<IReadOnlyList<string>>([]);
            },
            afterQueueEmptyMs: 1000);

        await closeStarted.Task.WaitAsync(
            TimeSpan.FromMilliseconds(200),
            TestContext.Current.CancellationToken);
        await firstCompletion;

        var second = await secondWait;
        await gate.CompleteAsync(
            second,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));
    }

    [Fact]
    public async Task SuccessfulOwnersHandOffInFifoOrderAndShareOneClose()
    {
        var mouseClicks = new MouseClickSuppression();
        var gate = new ConsoleCommandGate(mouseClicks);
        var first = await gate.WaitAsync(Target, CancellationToken.None);
        var secondWait = gate.WaitAsync(Target, CancellationToken.None);
        var thirdWait = gate.WaitAsync(Target, CancellationToken.None);
        var discardedCloseCalls = 0;

        Assert.True(mouseClicks.IsActive);

        var firstCompletion = gate.CompleteAsync(first, canContinue: true, () =>
        {
            discardedCloseCalls++;
            return Task.FromResult<IReadOnlyList<string>>([]);
        });
        var second = await secondWait;

        Assert.True(first.StartsSession);
        Assert.False(second.StartsSession);
        Assert.False(firstCompletion.IsCompleted);
        Assert.False(thirdWait.IsCompleted);
        Assert.True(mouseClicks.IsActive);

        var secondCompletion = gate.CompleteAsync(second, canContinue: true, () =>
        {
            discardedCloseCalls++;
            return Task.FromResult<IReadOnlyList<string>>([]);
        });
        var third = await thirdWait;

        Assert.False(third.StartsSession);
        Assert.False(secondCompletion.IsCompleted);
        Assert.True(mouseClicks.IsActive);

        var thirdCompletion = gate.CompleteAsync(
            third,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>(["FOREGROUND_RESTORE_FAILED"]));

        Assert.Equal(["FOREGROUND_RESTORE_FAILED"], await firstCompletion);
        Assert.Equal(["FOREGROUND_RESTORE_FAILED"], await secondCompletion);
        Assert.Equal(["FOREGROUND_RESTORE_FAILED"], await thirdCompletion);
        Assert.Equal(0, discardedCloseCalls);
        Assert.False(mouseClicks.IsActive);
    }

    [Fact]
    public async Task MouseClicksStaySuppressedThroughEmptyQueueDelayAndCleanup()
    {
        var mouseClicks = new MouseClickSuppression();
        var gate = new ConsoleCommandGate(mouseClicks);
        var lease = await gate.WaitAsync(Target, CancellationToken.None);
        var startedAt = Stopwatch.GetTimestamp();
        TimeSpan cleanupStartedAfter = default;

        await gate.CompleteAsync(
            lease,
            canContinue: true,
            () =>
            {
                cleanupStartedAfter = Stopwatch.GetElapsedTime(startedAt);
                Assert.True(mouseClicks.IsActive);
                return Task.FromResult<IReadOnlyList<string>>([]);
            },
            afterQueueEmptyMs: 60);

        Assert.True(cleanupStartedAfter >= TimeSpan.FromMilliseconds(45));
        Assert.False(mouseClicks.IsActive);
    }

    [Fact]
    public async Task CleanupFailureStillRestoresMouseClicks()
    {
        var mouseClicks = new MouseClickSuppression();
        var gate = new ConsoleCommandGate(mouseClicks);
        var lease = await gate.WaitAsync(Target, CancellationToken.None);

        var warnings = await gate.CompleteAsync(
            lease,
            canContinue: true,
            () => throw new InvalidOperationException("cleanup failed"));

        Assert.Equal(["INPUT_FAILED"], warnings);
        Assert.False(mouseClicks.IsActive);
    }

    [Fact]
    public async Task RequestArrivingDuringCloseStartsTheNextSession()
    {
        var gate = new ConsoleCommandGate();
        var first = await gate.WaitAsync(Target, CancellationToken.None);
        var closeStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var allowClose = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var firstCompletion = gate.CompleteAsync(first, canContinue: true, async () =>
        {
            closeStarted.SetResult();
            await allowClose.Task;
            return [];
        });
        await closeStarted.Task;

        var secondWait = gate.WaitAsync(Target, CancellationToken.None);
        Assert.False(secondWait.IsCompleted);

        allowClose.SetResult();
        Assert.Empty(await firstCompletion);

        var second = await secondWait;
        Assert.True(second.StartsSession);

        await gate.CompleteAsync(
            second,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));
    }

    [Fact]
    public async Task FailedOwnerClosesBeforeQueuedWorkStarts()
    {
        var gate = new ConsoleCommandGate();
        var first = await gate.WaitAsync(Target, CancellationToken.None);
        var secondWait = gate.WaitAsync(Target, CancellationToken.None);
        var closeStarted = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var allowClose = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        var firstCompletion = gate.CompleteAsync(first, canContinue: false, async () =>
        {
            closeStarted.SetResult();
            await allowClose.Task;
            return [];
        });
        await closeStarted.Task;

        Assert.False(secondWait.IsCompleted);

        allowClose.SetResult();
        await firstCompletion;

        var second = await secondWait;
        Assert.True(second.StartsSession);

        await gate.CompleteAsync(
            second,
            canContinue: true,
            () => Task.FromResult<IReadOnlyList<string>>([]));
    }
}
