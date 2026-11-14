namespace SpellBook.Telemetry;

public record Vec3(double X = 0, double Y = 0, double Z = 0)
{
    public bool IsFinite => double.IsFinite(X) && double.IsFinite(Y) && double.IsFinite(Z);
    public static Vec3 operator +(Vec3 a, Vec3 b) => new(a.X + b.X, a.Y + b.Y, a.Z + b.Z);
}
public record PositionObservation(string EntityId, long ElapsedUs, long Ordinal, long Sequence, Vec3 Location, Vec3 RawLocation, string Source, string CoordinateSpace, uint BaseGuid, string Reason, string? PlayFabId = null, uint? PlayerStateGuid = null, DateTimeOffset? SourceUtc = null);
public record TelemetryEntity(string EntityId, uint ActorGuid, int Channel, string Kind, bool Active, string? PlayFabId = null, string? Name = null, long? IdentityKnownAtUs = null, PositionObservation? Position = null, DateTimeOffset? NameObservedAtUtc = null, string Direction = "fromServer", bool Provisional = false);
public record TelemetryEvent(long Sequence, long ElapsedUs, long Ordinal, string Kind, string? EntityId, string Detail, ItemEventData? Item = null, long Count = 1, long? LastElapsedUs = null, string? GroupKey = null, PlayerEventData? Player = null, bool DetailTruncated = false);
public record NameObservation(string PlayFabId, string Name, string Source, DateTimeOffset ObservedAtUtc);
public record DecodedRecord(string Kind, int Channel, uint ActorGuid = 0, string? Archetype = null, Dictionary<string, object?>? Fields = null, Vec3? Location = null, string? Source = null, uint BaseGuid = 0, string? Detail = null, string Direction = "fromServer", bool Provisional = false, int? CloseReason = null, bool? SpawnLocationPresent = null, ObservationSource? Evidence = null);
public record TrackedRecord(TelemetryEvent Event, TelemetryEntity? Entity = null, PositionObservation? Position = null, PlayerStateSnapshot? Player = null);
