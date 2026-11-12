namespace SpellBook.Telemetry;

public sealed partial class PlayerTracker
{
    private readonly Dictionary<string, PlayerStateSnapshot> players = [];
    private readonly Dictionary<uint, string> actors = [];
    private readonly Dictionary<uint, string> stateTracks = [];
    private readonly Dictionary<uint, Dictionary<string, object?>> profiles = [];
    private readonly Dictionary<string, (double? Dealt, double? Received, long? Kills, long? Deaths)> totals = [];
    private readonly Dictionary<string, IReadOnlyList<string>> trackAliases = [];
    private long nextTrack;

    public PlayerStateSnapshot? Find(string entity) => players.GetValueOrDefault(entity);
    public PlayerReference Reference(uint actor)
    {
        var player = actors.TryGetValue(actor, out var entity) ? players.GetValueOrDefault(entity) : null;
        return player is { Active: true }
            ? new(player.TrackId, player.LifetimeId, player.EntityId, actor, player.PlayerStateGuid, player.PlayFabId)
            : new(null, null, null, actor);
    }
    public PlayerReference StateReference(uint state)
    {
        var player = players.Values.Where(value => value.Active && value.PlayerStateGuid == state)
            .OrderBy(value => value.ObservationKind == "pawn").LastOrDefault();
        return player is null ? new(null, null, null, 0, state)
            : new(player.TrackId, player.LifetimeId, player.EntityId, player.ActorGuid, state, player.PlayFabId);
    }

    public void RememberProfile(uint state, Dictionary<string, object?> fields)
    {
        if (state == 0) return;
        if (!profiles.TryGetValue(state, out var profile)) profiles[state] = profile = [];
        foreach (var (name, value) in fields) profile[name] = value;
    }

    public PlayerStateSnapshot? Observe(TelemetryEntity entity, uint? state, PacketEnvelope packet, long sequence, DecodedRecord? decoded = null)
    {
        if (entity.Kind == "playerState") return ObserveAccount(entity, packet, sequence, decoded);
        if (entity.Kind != "pawn") return null;
        var prior = players.GetValueOrDefault(entity.EntityId);
        var track = prior?.TrackId ?? $"player{++nextTrack}";
        var aliases = prior?.Aliases ?? [];
        if (prior?.PlayerStateGuid is > 0 && prior.PlayerStateGuid != state)
        {
            track = $"player{++nextTrack}";
            aliases = [];
        }
        if (entity.Direction == "toServer" && entity.ActorGuid != 0 && actors.TryGetValue(entity.ActorGuid, out var incomingEntity) &&
            players.TryGetValue(incomingEntity, out var incoming) && incoming.Active && incoming.TrackId != track)
        {
            aliases = aliases.Append(track).Distinct().ToArray();
            track = incoming.TrackId;
        }
        if (state is > 0)
        {
            if (stateTracks.TryGetValue(state.Value, out var known) && known != track)
            {
                if (totals.TryGetValue(track, out var orphan))
                {
                    var established = totals.GetValueOrDefault(known);
                    static double? Sum(double? a, double? b) => a is null && b is null ? null : (a ?? 0) + (b ?? 0);
                    static long? Count(long? a, long? b) => a is null && b is null ? null : (a ?? 0) + (b ?? 0);
                    totals[known] = (Sum(established.Dealt, orphan.Dealt), Sum(established.Received, orphan.Received),
                        Count(established.Kills, orphan.Kills), Count(established.Deaths, orphan.Deaths));
                    totals.Remove(track);
                }
                aliases = aliases.Append(track).Distinct().ToArray();
                track = known;
            }
            stateTracks[state.Value] = track;
        }
        if (trackAliases.TryGetValue(track, out var knownAliases)) aliases = knownAliases.Concat(aliases).Distinct().ToArray();
        if (aliases.Count > 0) trackAliases[track] = aliases;
        var snapshot = prior ?? new(track, entity.EntityId, entity.EntityId, entity.ActorGuid, entity.Active, packet.ElapsedUs, sequence, entity.Direction);
        snapshot = snapshot with
        {
            TrackId = track, ActorGuid = entity.ActorGuid, Active = entity.Active, ElapsedUs = packet.ElapsedUs, Sequence = sequence,
            PlayerStateGuid = state, PlayFabId = entity.PlayFabId, Name = entity.Name, Aliases = aliases,
            Source = decoded?.Evidence ?? snapshot.Source
        };
        var cumulative = totals.GetValueOrDefault(track);
        snapshot = snapshot with { DamageDealt = cumulative.Dealt, DamageReceived = cumulative.Received, Kills = cumulative.Kills, Deaths = cumulative.Deaths };
        if (decoded?.Fields is { } fields && decoded.Direction == "fromServer") snapshot = ApplyFields(snapshot, fields);
        if (state is > 0 && profiles.TryGetValue(state.Value, out var profile)) snapshot = ApplyFields(snapshot, profile);
        if (state is > 0 && accountStateConflicts.Contains(state.Value)) snapshot = WithoutAccountIdentity(snapshot);
        if (state is null && prior?.PlayerStateGuid is > 0)
            snapshot = snapshot with { Profile = null, Score = null };
        snapshot = inventory.Observe(snapshot, decoded?.Direction == "fromServer" ? decoded.Fields?.GetValueOrDefault("inventory") as SparseValues : null);
        players[entity.EntityId] = snapshot;
        if (entity.ActorGuid != 0 && entity.Active && entity.Direction == "fromServer") actors[entity.ActorGuid] = entity.EntityId;
        if (!entity.Active && actors.GetValueOrDefault(entity.ActorGuid) == entity.EntityId) actors.Remove(entity.ActorGuid);
        return snapshot;
    }

    private static PlayerStateSnapshot ApplyFields(PlayerStateSnapshot player, Dictionary<string, object?> fields)
    {
        static double? Number(Dictionary<string, object?> fields, string name, double? fallback) =>
            fields.TryGetValue(name, out var value) && value is IConvertible ? Convert.ToDouble(value) : fallback;
        var inventory = player.Inventory;
        if (fields.GetValueOrDefault("inventory") is SparseValues slots)
        {
            var known = inventory?.ToDictionary(slot => slot.Index) ?? [];
            foreach (var update in slots.Updates) known[update.Index] = new(update.Index, Convert.ToUInt32(update.Value));
            inventory = Enumerable.Range(0, slots.Length).Select(index => known.GetValueOrDefault(index) ?? new InventorySlot(index, null)).ToArray();
        }
        var statuses = player.Statuses;
        if (fields.GetValueOrDefault("statuses") is SparseValues mods)
        {
            var known = statuses?.ToDictionary(status => status.Index) ?? [];
            foreach (var update in mods.Updates) known[update.Index] = new(update.Index, Convert.ToInt32(update.Value));
            statuses = Enumerable.Range(0, mods.Length).Select(index => known.GetValueOrDefault(index) ?? new StatusValue(index, null)).ToArray();
        }
        var profile = player.Profile?.ToDictionary() ?? new Dictionary<string, object?>();
        foreach (var (name, value) in fields)
            if (name is not ("health" or "maxHealth" or "stamina" or "inventory" or "statuses" or "combatState" or "attackIndex"))
                profile[name] = value;
        return player with
        {
            Health = Number(fields, "health", player.Health), MaxHealth = Number(fields, "maxHealth", player.MaxHealth),
            Stamina = Number(fields, "stamina", player.Stamina), Inventory = inventory, Statuses = statuses,
            CombatState = fields.GetValueOrDefault("combatState") is int combat ? combat : player.CombatState,
            AttackIndex = fields.GetValueOrDefault("attackIndex") is int attack ? attack : player.AttackIndex,
            Score = Number(fields, "score", player.Score), Profile = profile.Count > 0 ? profile : null
        };
    }

    public PlayerEventData Event(DecodedRecord decoded, PlayerStateSnapshot? owner)
    {
        var fields = decoded.Fields ?? [];
        uint Guid(string name) => fields.GetValueOrDefault(name) is uint value ? value : 0;
        double? Number(string name) => fields.GetValueOrDefault(name) is IConvertible value ? value.ToDouble(null) : null;
        var target = owner is null ? Reference(decoded.ActorGuid) : new PlayerReference(owner.TrackId, owner.LifetimeId, owner.EntityId, owner.ActorGuid, owner.PlayerStateGuid, owner.PlayFabId);
        if (decoded.Kind == "damage") target = Reference(Guid("damageTakerGuid"));
        var actor = decoded.Kind switch
        {
            "damage" => Reference(Guid("damageInstigatorGuid")),
            "healing" => Guid("instigatorPlayerStateGuid") is > 0 and var state ? StateReference(state) : null,
            "death" => null,
            _ => target
        };
        var contributors = fields.GetValueOrDefault("killerGuids") is uint[] killers ? killers.Select(Reference).ToArray() : null;
        return new(actor, target, contributors, Number("amount"), Number("resultingValue"),
            fields.GetValueOrDefault("reasonCode") as int?, fields, decoded.Evidence);
    }

    public IReadOnlyList<PlayerStateSnapshot> Outcomes(string kind, PlayerEventData payload, PacketEnvelope packet, long sequence)
    {
        List<PlayerStateSnapshot> updates = [];
        void Update(PlayerReference? reference, Func<PlayerStateSnapshot, PlayerStateSnapshot> update)
        {
            if (reference?.EntityId is not { } entity || !players.TryGetValue(entity, out var player)) return;
            player = update(player) with { ElapsedUs = packet.ElapsedUs, Sequence = sequence, Source = payload.Source };
            players[entity] = player;
            totals[player.TrackId] = (player.DamageDealt, player.DamageReceived, player.Kills, player.Deaths);
            updates.RemoveAll(prior => prior.EntityId == entity);
            updates.Add(player);
        }
        if (kind == "damage" && payload.Amount is { } amount)
        {
            Update(payload.Target, player => player with { DamageReceived = (player.DamageReceived ?? 0) + amount });
            Update(payload.Actor, player => player with { DamageDealt = (player.DamageDealt ?? 0) + amount });
        }
        if (kind == "death")
        {
            Update(payload.Target, player => player with { Deaths = (player.Deaths ?? 0) + 1 });
            // A multi-contributor notification does not establish a sole kill credit.
            if (payload.ReasonCode == 0 && payload.Contributors is { Count: 1 } contributors && contributors[0].EntityId != payload.Target?.EntityId)
                Update(contributors[0], player => player with { Kills = (player.Kills ?? 0) + 1 });
        }
        return updates;
    }

    public void CloseState(uint state)
    {
        accountStateConflicts.Remove(state);
        stateTracks.Remove(state);
        profiles.Remove(state);
    }
    public void Clear()
    {
        players.Clear(); actors.Clear(); stateTracks.Clear(); profiles.Clear(); totals.Clear(); trackAliases.Clear(); accountConflicts.Clear();
        accountStateConflicts.Clear();
        inventory.Clear();
    }
}
