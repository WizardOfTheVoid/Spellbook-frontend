using System.Diagnostics;
namespace SpellBook.Telemetry;
public static class ParentLease
{
    public static async Task Watch(int pid, CancellationTokenSource lifetime)
    {
        try
        {
            using var parent = Process.GetProcessById(pid);
            await parent.WaitForExitAsync(lifetime.Token);
        }
        catch (OperationCanceledException) { return; }
        catch (ArgumentException) { }
        lifetime.Cancel();
    }
}
