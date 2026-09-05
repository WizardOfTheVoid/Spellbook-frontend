using CoreHost.Services;

namespace CoreHost.Tests;

public sealed class MovementKeyStateQueueTests
{
    [Fact]
    public async Task DownAndUpForEveryKeySurviveABurstBeyondTheFormerCapacity()
    {
        const int keyCount = 64;
        var queue = new MovementKeyStateQueue();

        foreach (var virtualKey in Enumerable.Range(1, keyCount))
        {
            Assert.True(queue.TryWrite(new MovementKeyStateChange(
                virtualKey,
                IsKeyDown: true,
                ForegroundWindow: IntPtr.Zero)));
            Assert.True(queue.TryWrite(new MovementKeyStateChange(
                virtualKey,
                IsKeyDown: true,
                ForegroundWindow: IntPtr.Zero)));
        }

        foreach (var virtualKey in Enumerable.Range(1, keyCount))
        {
            Assert.True(queue.TryWrite(new MovementKeyStateChange(
                virtualKey,
                IsKeyDown: false,
                ForegroundWindow: IntPtr.Zero)));
        }

        queue.Complete();
        var changes = new List<MovementKeyStateChange>();
        await foreach (var change in queue.ReadAllAsync())
        {
            changes.Add(change);
        }

        Assert.Equal(keyCount * 2, changes.Count);
        Assert.Equal(
            Enumerable.Range(1, keyCount),
            changes.Take(keyCount).Select(change => change.VirtualKey));
        Assert.All(changes.Take(keyCount), change => Assert.True(change.IsKeyDown));
        Assert.Equal(
            Enumerable.Range(1, keyCount),
            changes.Skip(keyCount).Select(change => change.VirtualKey));
        Assert.All(changes.Skip(keyCount), change => Assert.False(change.IsKeyDown));
    }

    [Fact]
    public async Task RepeatedKeyDownAfterForegroundChangeIsPreserved()
    {
        var queue = new MovementKeyStateQueue();
        queue.TryWrite(new MovementKeyStateChange(0x57, true, new IntPtr(1)));
        queue.TryWrite(new MovementKeyStateChange(0x57, true, new IntPtr(2)));
        queue.Complete();

        var foregroundWindows = new List<IntPtr>();
        await foreach (var change in queue.ReadAllAsync())
        {
            foregroundWindows.Add(change.ForegroundWindow);
        }

        Assert.Equal([new IntPtr(1), new IntPtr(2)], foregroundWindows);
    }
}
