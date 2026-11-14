namespace SpellBook.Telemetry;

public record CaptureCapabilities(bool Available, string? Reason = null);
public record PacketEnvelope(long Ordinal, long ElapsedUs, DateTimeOffset Timestamp, int LinkKind, int OriginalLength, byte[] Bytes, long LossCount = 0, bool HasCaptureClock = false);
public record CaptureStarted(DateTimeOffset StartedAtUtc);
public record CaptureMessage(string Kind, PacketEnvelope? Packet = null, DateTimeOffset? StartedAtUtc = null, string? Error = null);
public record CaptureRequest(Endpoint Endpoint, string RecordingId);
