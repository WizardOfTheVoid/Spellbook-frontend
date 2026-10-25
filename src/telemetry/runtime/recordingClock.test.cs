namespace SpellBook.Telemetry;
public class RecordingClockTests
{
    [Fact] public void JoinsTheExistingActivationClock()
    {
        var clock = new RecordingClock();
        clock.Start(DateTimeOffset.UtcNow.AddSeconds(-2));
        Assert.InRange(clock.ElapsedUs,2_000_000,3_000_000);
    }
}
