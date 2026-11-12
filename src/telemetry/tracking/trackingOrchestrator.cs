namespace SpellBook.Telemetry;
public sealed class TrackingOrchestrator
{
    private readonly ActorLifetimes lifetimes = new();
    private readonly IdentityResolver identities = new();
    private readonly BaseCoordinateResolver coordinates = new();
    private readonly ItemTracker items = new();
    private readonly PlayerTracker players;
    private long sequence;
    public TrackingOrchestrator() => players = new(items.ClassPath);
    public IReadOnlyList<TrackedRecord> Apply(DecodedRecord decoded, PacketEnvelope packet)
    {
        var records = new List<TrackedRecord>();
        var itemsApplied = false;
        TelemetryEvent Event(string kind, string? entityId, string detail) => new(++sequence, packet.ElapsedUs, packet.Ordinal, kind, entityId, detail);
        string? Account(uint actor)
        {
            var accounts = lifetimes.All.Where(entity => entity.Active && entity.ActorGuid == actor && entity.Kind == "pawn").Select(entity => identities.Resolve(entity.EntityId)?.PlayFabId).Where(id => id is not null).Distinct().Take(2).ToArray();
            return accounts.Length == 1 ? accounts[0] : null;
        }
        void ItemEvents()
        {
            if (itemsApplied) return;
            itemsApplied = true;
            foreach (var item in items.Apply(decoded, packet, Account))
            {
                var owner = item.Item?.OwnerGuid is > 0 and var ownerGuid ? players.Reference(ownerGuid) : null;
                var instigator = item.Item?.InstigatorGuid is > 0 and var instigatorGuid ? players.Reference(instigatorGuid) : null;
                var related = new[] { owner, instigator }.Where(reference => reference?.TrackId is not null).Cast<PlayerReference>().DistinctBy(reference => reference.TrackId).ToArray();
                var payload = related.Length == 0 ? null : new PlayerEventData(Actor: related[0], Contributors: related,
                    Values: new Dictionary<string, object?> { ["owner"] = owner, ["instigator"] = instigator, ["relationship"] = "observedItemReference" }, Source: decoded.Evidence);
                records.Add(new(new(++sequence, packet.ElapsedUs, packet.Ordinal, item.Kind, null, item.Detail, item.Item, item.Count, Player: payload)));
            }
            void RefreshInventory(uint guid)
            {
                foreach (var player in players.RefreshInventory(guid, packet, () => ++sequence))
                {
                    var owner = new PlayerReference(player.TrackId, player.LifetimeId, player.EntityId, player.ActorGuid, player.PlayerStateGuid, player.PlayFabId);
                    var payload = new PlayerEventData(Actor: owner, Values: new Dictionary<string, object?>
                    {
                        ["itemGuid"] = guid, ["classPath"] = items.ClassPath(guid)
                    }, Source: decoded.Evidence);
                    records.Add(new(new(player.Sequence, packet.ElapsedUs, packet.Ordinal, "inventoryClassChanged", player.EntityId,
                        "Observed inventory item type changed", Player: payload), Player: player));
                }
            }
            if (items.ReusedGuid is { } reused) players.InvalidateInventory(reused);
            if (decoded.ActorGuid != 0) RefreshInventory(decoded.ActorGuid);
            if (items.EvictedGuid is { } evicted && evicted != decoded.ActorGuid)
            {
                players.InvalidateInventory(evicted);
                RefreshInventory(evicted);
            }
        }
        void RefreshIdentities()
        {
            foreach (var pawn in lifetimes.All.Where(candidate => candidate.Active && candidate.Kind == "pawn").ToArray())
            {
                var proof = identities.Resolve(pawn.EntityId);
                var currentState = identities.State(pawn.EntityId);
                var player = players.Find(pawn.EntityId);
                if (proof?.PlayFabId == pawn.PlayFabId && proof?.Name == pawn.Name && (player is null || player.PlayerStateGuid == currentState)) continue;
                var linked = pawn with { PlayFabId = proof?.PlayFabId, Name = proof?.Name, IdentityKnownAtUs = proof is null ? null : packet.ElapsedUs };
                lifetimes.Set(linked);
                var ev = Event(proof is null ? "identityCleared" : "identityResolved", linked.EntityId, "Typed PlayerState identity changed");
                records.Add(new(ev, linked, Player: players.Observe(linked, currentState, packet, ev.Sequence)));
            }
        }
        void LinkOutgoingPeer(TelemetryEntity outgoing)
        {
            var incoming = lifetimes.Current(outgoing.Channel, "fromServer");
            if (outgoing.Direction == "toServer" && outgoing.ActorGuid != 0 && incoming is { Active: true } && incoming.ActorGuid == outgoing.ActorGuid)
                identities.Link(outgoing.EntityId, identities.State(incoming.EntityId) ?? 0);
        }
        void Close(string detail)
        {
            foreach (var old in lifetimes.Close(decoded.Channel, decoded.Direction))
            {
                var state = identities.State(old.EntityId);
                identities.Unlink(old.EntityId);
                if (old.Kind == "playerState" && old.Direction == "fromServer"
                    && !lifetimes.All.Any(other => other.Active && other.Direction == "fromServer" && other.Kind == "playerState" && other.ActorGuid == old.ActorGuid))
                { identities.CloseState(old.ActorGuid); players.CloseState(old.ActorGuid); }
                var ev = Event("actorClosed", old.EntityId, detail);
                records.Add(new(ev, old, Player: players.Observe(old, state, packet, ev.Sequence)));
            }
            RefreshIdentities();
        }
        if (decoded.Kind == "captureGap")
        {
            foreach (var old in lifetimes.All.Where(entity => entity.Active).ToArray())
            {
                var closed = old with { Active = false };
                var ev = Event("actorClosed", old.EntityId, "Capture continuity lost");
                records.Add(new(ev, closed, Player: players.Observe(closed, identities.State(old.EntityId), packet, ev.Sequence)));
            }
            lifetimes.Clear(); identities.Clear(); players.Clear();
            ItemEvents();
            records.Add(new(Event("captureGap", null, decoded.Detail ?? "Capture continuity lost"))); return records;
        }
        if (decoded.Kind == "decoderUnsupported") return [new(Event(decoded.Kind, null, decoded.Detail ?? "Unsupported encoding") with { Player = decoded.Evidence is null ? null : new(Source: decoded.Evidence) })];
        if (decoded.Kind == "actorOpened" && items.IsDestroyed(decoded.ActorGuid)) ItemEvents();
        var objectCandidate = ItemTracker.CanObserveUnknown(decoded) || items.IsTrackedObject(decoded.ActorGuid) && !items.IsKnownItem(decoded.ActorGuid);
        if (objectCandidate) ItemEvents();
        if (objectCandidate && decoded.Kind == "actorOpened")
        {
            Close("Actor channel replaced");
            return records;
        }
        if (decoded.Detail == "item" || ItemClassification.IsItemPath(decoded.Archetype) || items.IsKnownItem(decoded.ActorGuid))
        {
            if (decoded.Kind is "actorOpened" or "actorResolved" or "actorClosed") Close("Actor channel belongs to an item");
            if (!objectCandidate) ItemEvents();
            return records;
        }
        if (decoded.Kind == "actorClosed")
        {
            Close("Actor channel closed");
            return records;
        }
        var previous = lifetimes.Current(decoded.Channel, decoded.Direction);
        if (decoded.Kind == "actorResolved" && decoded.Detail == "actor" && previous?.Kind is "pawn" or "playerState")
            Close("Actor class disproves provisional classification");
        if (decoded.Kind == "actorOpened" || previous is { Active: true, ActorGuid: > 0 } && decoded.ActorGuid != 0 && previous.ActorGuid != decoded.ActorGuid)
            Close("Actor channel replaced");
        var entity = decoded.Kind == "actorOpened" ? lifetimes.Open(decoded.Channel, decoded.ActorGuid, decoded.Detail ?? "unknown", decoded.Direction, decoded.Provisional)
            : lifetimes.Get(decoded.Channel, decoded.ActorGuid, decoded.Kind == "position" ? "pawn" : decoded.Detail ?? "unknown", decoded.Direction, decoded.Provisional);
        LinkOutgoingPeer(entity);
        if (decoded.Kind == "actorResolved" && entity.Kind == "playerState" && entity.Direction == "fromServer"
            && players.Find(entity.EntityId)?.PlayFabId is { } retainedAccount && identities.Contradicts(entity.ActorGuid, retainedAccount))
            identities.Quarantine(entity.ActorGuid);
        if (decoded.Kind == "properties" && decoded.Fields is { } fields)
        {
            if (decoded.Direction == "fromServer" && (entity.Kind == "playerState" || fields.ContainsKey("playFabIdentity")))
                players.RememberProfile(decoded.ActorGuid, fields);
            if (decoded.Direction == "fromServer" && fields.TryGetValue("playerStateGuid", out var state) && state is uint guid)
            {
                identities.Link(entity.EntityId, guid);
                if (lifetimes.Current(entity.Channel, "toServer") is { Active: true } outgoing)
                {
                    LinkOutgoingPeer(outgoing);
                    RefreshIdentities();
                }
                var proof = identities.Resolve(entity.EntityId);
                entity = entity with { PlayFabId = proof?.PlayFabId, Name = proof?.Name,
                    IdentityKnownAtUs = proof is null ? null : Math.Max(proof.KnownAtUs, packet.ElapsedUs) };
                var linkEvent = Event(guid == 0 ? "playerStateCleared" : "playerStateLinked", entity.EntityId, $"PlayerState {guid}");
                records.Add(new(linkEvent, entity, Player: players.Observe(entity, identities.State(entity.EntityId), packet, linkEvent.Sequence, decoded)));
            }
            if (decoded.Direction == "fromServer" && fields.TryGetValue("playFabIdentity", out var identity) && identity is UniqueNetId id)
            {
                identities.Remember(decoded.ActorGuid, id, fields.GetValueOrDefault("playerName") as string, packet.ElapsedUs);
            }
            else if (decoded.Direction == "fromServer" && fields.GetValueOrDefault("playerName") is string name)
            {
                identities.ObserveName(decoded.ActorGuid, name);
                RefreshIdentities();
            }
        }
        if (entity.Kind == "playerState" && entity.Direction == "fromServer" && identities.IsConflicted(entity.ActorGuid))
        {
            foreach (var account in players.InvalidateAccounts(entity.ActorGuid, entity.EntityId, packet, () => ++sequence, decoded.Evidence))
                records.Add(new(new(account.Sequence, packet.ElapsedUs, packet.Ordinal, "identityCleared", account.EntityId,
                    "Conflicting PlayerState account identity", Player: new(Source: decoded.Evidence)), Player: account));
            RefreshIdentities();
        }
        else if (decoded.Direction == "fromServer" && decoded.Fields?.ContainsKey("playFabIdentity") == true) RefreshIdentities();
        var resolved = identities.Resolve(entity.EntityId);
        entity = resolved is not null
            ? entity with { PlayFabId = resolved.PlayFabId, Name = resolved.Name, IdentityKnownAtUs = Math.Max(resolved.KnownAtUs, entity.IdentityKnownAtUs ?? packet.ElapsedUs) }
            : entity with { PlayFabId = null, Name = null, IdentityKnownAtUs = null };
        if (decoded.Kind == "position" && decoded.Location is { } raw)
        {
            var coordinate = coordinates.Resolve(raw, decoded.Source ?? "unknown", decoded.BaseGuid);
            var ev = Event("position", entity.EntityId, decoded.Detail ?? coordinate.Reason);
            var point = new PositionObservation(entity.EntityId, packet.ElapsedUs, packet.Ordinal, ev.Sequence, coordinate.Location, raw, decoded.Source ?? "unknown", coordinate.Space, decoded.BaseGuid, coordinate.Reason, entity.PlayFabId, identities.State(entity.EntityId),packet.Timestamp);
            entity = entity with { Position = point };
            lifetimes.Set(entity);
            var priorPlayer = players.Find(entity.EntityId);
            var stateGuid = identities.State(entity.EntityId);
            var changed = priorPlayer is null || priorPlayer.ActorGuid != entity.ActorGuid || priorPlayer.PlayerStateGuid != stateGuid ||
                priorPlayer.PlayFabId != entity.PlayFabId;
            var player = changed ? players.Observe(entity, stateGuid, packet, ev.Sequence, decoded) : null;
            records.Add(new(ev, entity, point, player));
        }
        else
        {
            lifetimes.Set(entity);
            if (decoded.Kind is "actorOpened" or "actorResolved")
            {
                var ev = Event(decoded.Kind, entity.EntityId, decoded.Archetype ?? "Missing actor metadata");
                records.Add(new(ev, entity, Player: players.Observe(entity, identities.State(entity.EntityId), packet, ev.Sequence, decoded)));
            }
            else if (decoded.Kind == "properties")
            {
                var observedFields = decoded.Fields ?? [];
                if (entity.Kind == "playerState")
                {
                    var account = players.Observe(entity, null, packet, sequence + 1, decoded);
                    if (account is not null)
                    {
                        var ev = Event("accountStateObserved", entity.EntityId, "Observed PlayerState account profile");
                        records.Add(new(ev with { Player = players.Event(decoded, account) }, entity, Player: account));
                    }
                }
                if (entity.Kind == "playerState" && observedFields.Keys.Any(key => key != "playFabIdentity") ||
                    observedFields.Keys.Any(key => key is "health" or "maxHealth" or "stamina" or "inventory" or "statuses" or "combatState" or "attackIndex"))
                {
                    var kind = observedFields.ContainsKey("inventory") ? "inventoryChanged" : observedFields.ContainsKey("statuses") ? "statusChanged"
                        : observedFields.ContainsKey("combatState") || observedFields.ContainsKey("attackIndex") ? "combatStateChanged" : "playerStateUpdated";
                    if (entity.Kind == "pawn")
                    {
                        var ev = Event(kind, entity.EntityId, "Observed replicated player state");
                        var player = players.Observe(entity, identities.State(entity.EntityId), packet, ev.Sequence, decoded);
                        records.Add(new(ev with { Player = players.Event(decoded, player) }, entity, Player: player));
                    }
                    else if (entity.Kind == "playerState")
                        foreach (var pawn in lifetimes.All.Where(candidate => candidate.Active && candidate.Kind == "pawn" && identities.State(candidate.EntityId) == entity.ActorGuid))
                        {
                            var ev = Event("playerStateUpdated", pawn.EntityId, "Observed linked PlayerState profile");
                            records.Add(new(ev, pawn, Player: players.Observe(pawn, entity.ActorGuid, packet, ev.Sequence, decoded)));
                        }
                    else if (decoded.Evidence is not null)
                    {
                        var ev = Event("componentStateObserved", entity.EntityId, "Observed component state without a player link");
                        records.Add(new(ev with { Player = new(Values: observedFields, Source: decoded.Evidence) }));
                    }
                }
            }
            else if (decoded.Evidence is not null)
            {
                var ev = Event(decoded.Kind, entity.EntityId, "Observed component notification or request");
                var player = players.Observe(entity, identities.State(entity.EntityId), packet, ev.Sequence);
                var payload = players.Event(decoded, player);
                var outcomes = players.Outcomes(decoded.Kind, payload, packet, ev.Sequence);
                records.Add(new(ev with { Player = payload }, entity, Player: outcomes.FirstOrDefault(value => value.EntityId == entity.EntityId)));
                foreach (var outcome in outcomes.Where(value => value.EntityId != entity.EntityId))
                {
                    var update = Event("playerStatistics", outcome.EntityId, "Observed notification totals");
                    records.Add(new(update, Player: outcome with { Sequence = update.Sequence }));
                }
            }
        }
        return records;
    }
}
