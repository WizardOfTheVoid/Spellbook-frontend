namespace SpellBook.Telemetry;

public record ItemEventData(string ClassPath, uint ActorGuid, uint? OwnerGuid = null, uint? InstigatorGuid = null, string? PlayFabId = null, string? Attribution = null, int? CloseReason = null, Vec3? Location = null, bool? SpawnLocationPresent = null);
