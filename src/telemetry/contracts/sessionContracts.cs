using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SpellBook.Telemetry;

public record Endpoint(string Host, int Port)
{
    public bool IsValid => IPAddress.TryParse(Host, out var ip) && ip.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && Port is > 0 and <= 65535;
}
public record CommittedHead(long Sequence = 0, long ElapsedUs = 0);
public record StreamCursor(string Generation, long UpdateSequence);
public record RecordingStatus(string Id, Endpoint Endpoint)
{
    public string State { get; set; } = "starting";
    public DateTimeOffset RequestedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? StartedAtUtc { get; set; }
    public DateTimeOffset? StoppedAtUtc { get; set; }
    public CommittedHead Head { get; set; } = new();
    public long Revision { get; set; }
    public string Generation { get; set; } = Guid.NewGuid().ToString();
    public long UpdateSequence { get; set; }
    public long SizeBytes { get; set; }
    public long PacketCount { get; set; }
    public long LossCount { get; set; }
    public string DecoderVersion { get; set; } = DecoderProfile.Version;
    public int SchemaVersion { get; set; } = 1;
    public int ProjectionVersion { get; set; }
    public string? StopReason { get; set; }
    public StreamCursor Cursor => new(Generation, UpdateSequence);
}
public static class Wire
{
    public const int Version = 1;
    public const int MaxBytes = 1_048_576;
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static bool IsPlayFabId(string? value) => value is not null && Regex.IsMatch(value, "\\A[0-9a-fA-F]{1,16}\\z");
    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Json);
}
