namespace SpellBook.Telemetry;

public sealed partial class PlayerTracker
{
    private readonly HashSet<string> accountConflicts = [];
    private readonly HashSet<uint> accountStateConflicts = [];

    private static PlayerStateSnapshot WithoutAccountIdentity(PlayerStateSnapshot player) => player with
    {
        PlayFabId = null, Name = null,
        Profile = player.Profile?.Where(pair => pair.Key is not ("playFabIdentity" or "playerName")).ToDictionary()
    };

    public IReadOnlyList<PlayerStateSnapshot> InvalidateAccounts(uint state, string currentEntity, PacketEnvelope packet, Func<long> nextSequence, ObservationSource? source)
    {
        if (state == 0) return [];
        accountStateConflicts.Add(state);
        if (profiles.TryGetValue(state, out var profile)) { profile.Remove("playFabIdentity"); profile.Remove("playerName"); }
        var updates = new List<PlayerStateSnapshot>();
        foreach (var prior in players.Values.Where(player => player.Active && player.ObservationKind == "account"
            && player.ActorGuid == state && player.EntityId != currentEntity && (player.PlayFabId is not null || player.Name is not null)).ToArray())
        {
            accountConflicts.Add(prior.EntityId);
            var cleared = WithoutAccountIdentity(prior) with { Sequence = nextSequence(), ElapsedUs = packet.ElapsedUs, Source = source };
            players[prior.EntityId] = cleared;
            updates.Add(cleared);
        }
        return updates;
    }

    private PlayerStateSnapshot? ObserveAccount(TelemetryEntity entity, PacketEnvelope packet, long sequence, DecodedRecord? decoded)
    {
        if (entity.Direction != "fromServer") return null;
        var prior = players.GetValueOrDefault(entity.EntityId);
        if (!entity.Active)
        {
            players.Remove(entity.EntityId);
            accountConflicts.Remove(entity.EntityId);
            if (prior is null) return null;
            var closedTotals = totals.GetValueOrDefault(prior.TrackId);
            return prior with { Active = false, ElapsedUs = packet.ElapsedUs, Sequence = sequence,
                DamageDealt = closedTotals.Dealt, DamageReceived = closedTotals.Received, Kills = closedTotals.Kills, Deaths = closedTotals.Deaths };
        }
        var fields = decoded?.Fields ?? [];
        var typed = fields.GetValueOrDefault("playFabIdentity") as UniqueNetId;
        var account = typed is { Type: "PlayFab" } && Wire.IsPlayFabId(typed.Id) ? typed.Id!.ToUpperInvariant() : null;
        if (prior is null && account is null) return null;
        if (account is not null && prior?.PlayFabId is { } knownAccount && account != knownAccount)
            accountConflicts.Add(entity.EntityId);
        var conflicted = accountConflicts.Contains(entity.EntityId) || accountStateConflicts.Contains(entity.ActorGuid);
        account = conflicted ? null : account ?? prior?.PlayFabId;
        var track = prior?.TrackId ?? $"player{++nextTrack}";
        var aliases = prior?.Aliases ?? [];
        if (entity.ActorGuid != 0)
        {
            if (stateTracks.TryGetValue(entity.ActorGuid, out var knownTrack) && knownTrack != track)
            {
                aliases = aliases.Append(track).Distinct().ToArray();
                track = knownTrack;
            }
            stateTracks[entity.ActorGuid] = track;
        }
        if (trackAliases.TryGetValue(track, out var knownAliases)) aliases = knownAliases.Concat(aliases).Distinct().ToArray();
        if (aliases.Count > 0) trackAliases[track] = aliases;
        var snapshot = prior ?? new(track, entity.EntityId, entity.EntityId, entity.ActorGuid, true, packet.ElapsedUs, sequence, ObservationKind: "account");
        snapshot = ApplyFields(snapshot, fields) with
        {
            TrackId = track, ActorGuid = entity.ActorGuid, PlayerStateGuid = entity.ActorGuid == 0 ? null : entity.ActorGuid,
            PlayFabId = account, Name = conflicted ? null : fields.GetValueOrDefault("playerName") as string ?? prior?.Name,
            ElapsedUs = packet.ElapsedUs, Sequence = sequence, Aliases = aliases, Source = decoded?.Evidence ?? prior?.Source
        };
        var cumulative = totals.GetValueOrDefault(track);
        snapshot = snapshot with { DamageDealt = cumulative.Dealt, DamageReceived = cumulative.Received, Kills = cumulative.Kills, Deaths = cumulative.Deaths };
        if (conflicted) snapshot = WithoutAccountIdentity(snapshot);
        if (entity.ActorGuid != 0 && snapshot.Profile is { } profile) RememberProfile(entity.ActorGuid, profile.ToDictionary());
        players[entity.EntityId] = snapshot;
        return snapshot;
    }
}
