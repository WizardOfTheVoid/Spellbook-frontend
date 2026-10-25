using System.Text.Json;
namespace SpellBook.Telemetry;

public sealed record ImportMetadata(Endpoint Endpoint, DateTimeOffset? Start, long Duration = 0, string Reason = "imported")
{
    public static ImportMetadata Read(ImportInput input)
    {
        if (input.Manifest is null)
        {
            if (input.Endpoint?.IsValid != true)
                throw new ArgumentException("No recording metadata found. Select capture.json or manifest.json, or enter the endpoint under Standalone packet capture.");
            return new(input.Endpoint, null);
        }
        try
        {
            using var json = JsonDocument.Parse(File.ReadAllText(input.Manifest));
            var m = json.RootElement;
            var native = m.TryGetProperty("endpoint", out var address);
            var endpoint = native
                ? new Endpoint(address.GetProperty("host").GetString()!, address.GetProperty("port").GetInt32())
                : new Endpoint(m.GetProperty("serverIp").GetString()!, m.GetProperty("gamePort").GetInt32());
            if (!endpoint.IsValid) throw new ArgumentException("Recording metadata has an invalid server endpoint");
            DateTimeOffset? start = m.TryGetProperty(native ? "startedAtUtc" : "captureStartUtc", out var at) && at.ValueKind != JsonValueKind.Null
                ? at.GetDateTimeOffset() : null;
            var duration = native && m.TryGetProperty("head", out var head)
                ? head.GetProperty("elapsedUs").GetInt64()
                : start is not null && m.TryGetProperty("captureStopUtc", out var end) && end.ValueKind != JsonValueKind.Null
                    ? (end.GetDateTimeOffset() - start.Value).Ticks / 10 : 0;
            if (duration < 0) throw new ArgumentException("Recording metadata has an invalid duration");
            var reason = m.TryGetProperty("stopReason", out var stop) && stop.ValueKind == JsonValueKind.String
                ? stop.GetString()! : "imported";
            return new(endpoint, start, duration, reason);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or KeyNotFoundException or FormatException or OverflowException)
        {
            throw new ArgumentException("Invalid recording metadata: expected a server endpoint and valid capture timing", error);
        }
    }
}
