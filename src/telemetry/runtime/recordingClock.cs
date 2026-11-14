using System.Diagnostics;
namespace SpellBook.Telemetry;
public sealed class RecordingClock
{
    private readonly Stopwatch stopwatch = new();
    private long initialUs;
    public DateTimeOffset StartedAtUtc { get; private set; }
    public long ElapsedUs => initialUs + stopwatch.ElapsedTicks * 1_000_000 / Stopwatch.Frequency;
    public void Start(DateTimeOffset utc) { StartedAtUtc = utc; initialUs = Math.Max(0,(DateTimeOffset.UtcNow-utc).Ticks/10); stopwatch.Restart(); }
}
