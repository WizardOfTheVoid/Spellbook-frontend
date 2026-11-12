namespace SpellBook.Telemetry;

public record PlayerReference(string? TrackId, string? LifetimeId, string? EntityId, uint ActorGuid, uint? PlayerStateGuid = null, string? PlayFabId = null);
public record ObservationSource(string Direction, int Channel, uint ActorGuid, uint ObjectGuid, string? ClassPath, int StartBit, int EndBit, int TotalBits, long CompletionOrdinal, string Coverage, int? FieldId = null, string? RawBody = null, string? ConnectionKey = null);
public record InventorySlot(int Index, uint? ItemGuid, string? ClassPath = null);
public record StatusValue(int Index, int? Value);
public record PlayerStateSnapshot(
    string TrackId, string LifetimeId, string EntityId, uint ActorGuid, bool Active,
    long ElapsedUs, long Sequence, string Direction = "fromServer",
    uint? PlayerStateGuid = null, string? PlayFabId = null, string? Name = null,
    double? Health = null, double? MaxHealth = null, double? Stamina = null,
    IReadOnlyList<InventorySlot>? Inventory = null, IReadOnlyList<StatusValue>? Statuses = null,
    int? CombatState = null, int? AttackIndex = null, double? Score = null,
    double? DamageDealt = null, double? DamageReceived = null, long? Kills = null, long? Deaths = null,
    IReadOnlyDictionary<string, object?>? Profile = null,
    IReadOnlyList<string>? Aliases = null, ObservationSource? Source = null, bool DetailTruncated = false,
    string ObservationKind = "pawn");
public record PlayerEventData(
    PlayerReference? Actor = null, PlayerReference? Target = null,
    IReadOnlyList<PlayerReference>? Contributors = null, double? Amount = null,
    double? ResultingValue = null, int? ReasonCode = null,
    IReadOnlyDictionary<string, object?>? Values = null, ObservationSource? Source = null);
public record SparseValue(int Index, object? Value);
public record SparseValues(int Length, IReadOnlyList<SparseValue> Updates);
