namespace SpellBook.Telemetry;

public record ReadView(string Generation, long ThroughSequence, long AtUs);
public record TelemetrySummary(long ActivePlayers, long KnownPlayers, IReadOnlyDictionary<string, long> Counts, double? DamageDealt = null, double? DamageReceived = null, long? Kills = null, long? Deaths = null, double? HealAmount = null);
public record TelemetryCapabilities(int SchemaVersion, int ProjectionVersion, bool Players, bool MetricHistory);
public record TelemetryFrame(string RecordingId, long Revision, long AtUs, CommittedHead CommittedHead, StreamCursor Cursor, IReadOnlyList<TelemetryEntity> Entities, Dictionary<string, long> Coverage, ReadView? ReadView = null, IReadOnlyList<PlayerStateSnapshot>? Players = null, TelemetrySummary? Summary = null, TelemetryCapabilities? Capabilities = null);
public record TrajectoryQuery(string RecordingId, long FromUs, long ToUs, string[] EntityIds, int MaxPoints = 2000, ReadView? ReadView = null);
public record TrajectoryPath(string EntityId, string CoordinateSpace, IReadOnlyList<PositionObservation> Points);
public record TrajectoryPage(string RecordingId, long Revision, IReadOnlyList<TrajectoryPath> Paths, bool Truncated, ReadView? ReadView = null);
public record EventQuery(string RecordingId, long FromUs, long ToUs, long AfterSequence = 0, int Limit = 200, string? EntityId = null, string[]? Kinds = null, bool GroupItems = true, bool NewestFirst = false, ReadView? ReadView = null, string? TrackId = null, string? Search = null, int Offset = 0);
public record EventPage(string RecordingId, long Revision, IReadOnlyList<TelemetryEvent> Events, long? NextSequence, CommittedHead CommittedHead, ReadView? ReadView = null, long? MatchingGroups = null, int? NextOffset = null);
public record PlayerQuery(string RecordingId, long AtUs, int Offset = 0, int Limit = 100, string? LifetimeId = null, bool IncludeDeparted = true, ReadView? ReadView = null);
public record PlayerPage(string RecordingId, long Revision, IReadOnlyList<PlayerStateSnapshot> Players, int? NextOffset, ReadView ReadView);
public record MetricHistoryQuery(string RecordingId, long FromUs, long ToUs, string TrackId, string[]? Metrics = null, int MaxPoints = 512, ReadView? ReadView = null);
public record MetricPoint(long ElapsedUs, double? Value, string LifetimeId);
public record MetricSeries(string Metric, IReadOnlyList<MetricPoint> Points);
public record MetricHistoryPage(string RecordingId, long Revision, IReadOnlyList<MetricSeries> Series, bool Truncated, ReadView ReadView);
public record TelemetryUpdate(int ProtocolVersion, string RecordingId, long Revision, StreamCursor Cursor, CommittedHead CommittedHead, string Kind, string State);
public record StartRecordingRequest(Endpoint Endpoint);
public record RecordingJob(string Id, string RecordingId, string Kind)
{
    public string State { get; set; } = "queued";
    public long Processed { get; set; }
    public long Total { get; set; }
    public string? Error { get; set; }
}
