using System.Text.Json;
namespace SpellBook.Telemetry;
public class PrivateCaptureTests
{
    public static bool HasCapture => Environment.GetEnvironmentVariable("TELEMETRY_PRIVATE_CAPTURE") is not null;
    [Fact(Skip = "Explicit local private-capture acceptance only", SkipUnless = nameof(HasCapture))]
    public void FullJoinMatchesObservedPositionsAndAccounts()
    {
        var root = Environment.GetEnvironmentVariable("TELEMETRY_PRIVATE_CAPTURE")!;
        var capture = JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"capture.json"))).RootElement;
        var endpoint = new Endpoint(capture.GetProperty("serverIp").GetString()!,capture.GetProperty("gamePort").GetInt32());
        var start = capture.GetProperty("captureStartUtc").GetDateTimeOffset();
        var decoder = new DecodingOrchestrator(endpoint); var tracker = new TrackingOrchestrator();
        var positions = new List<PositionObservation>(); var events = new List<TelemetryEvent>(); var accounts = new HashSet<string>();
        foreach (var file in Directory.GetFiles(root,"gameTraffic*.pcapng").Order())
        foreach (var packet in PacketLog.Read(file,start))
        foreach (var decoded in decoder.Accept(packet))
        foreach (var row in tracker.Apply(decoded,packet))
        {
            if (row.Position is not null) positions.Add(row.Position);
            if (row.Entity?.PlayFabId is { } id) accounts.Add(id);
            if (row.Event.Kind != "position") events.Add(row.Event);
        }
        var output = Environment.GetEnvironmentVariable("TELEMETRY_PRIVATE_REPORT");
        if (output is not null) File.WriteAllText(output,Wire.Serialize(new { count=positions.Count, accounts, sources=positions.GroupBy(p=>p.Source).ToDictionary(g=>g.Key,g=>g.Count()), errors=events.Where(e=>e.Kind=="decoderUnsupported").Take(10), positions }));
        Assert.Equal(2664,positions.Count);
        Assert.Equal(5,accounts.Count);
        Assert.Equal(1211,positions.Count(p=>p.Source.StartsWith("serverMove",StringComparison.Ordinal)));
    }
}
