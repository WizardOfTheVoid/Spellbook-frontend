namespace SpellBook.Telemetry;

public sealed class ActorChannelDecoder(NetGuidCache cache, ChannelTracker channels, PartialBunchAssembler partials)
{
    private readonly ColdIdentityRecovery identities = new();

    public void Apply(string direction, Bunch bunch, long ordinal, List<DecodedRecord> output, long? completionOrdinal = null)
    {
        var state = channels.Get(direction, bunch.Channel);
        if (bunch.Name is not null) state.Name = bunch.Name;
        if (bunch.Exports)
        {
            ObjectExportReader.Read(bunch.Data, cache);
            foreach (var (key, known) in channels.All.ToArray()) Refresh(key.Direction, key.Channel, known, output);
            bunch = bunch with { Data = new([]) };
        }
        var assembled = partials.Accept(direction, bunch);
        if (assembled is null) return;
        bunch = assembled;
        var reader = bunch.Data;
        if (bunch.MustMap)
        {
            var count = reader.Bits(16);
            if (count > 2048) throw new InvalidDataException("Must-map count");
            for (ulong i = 0; i < count; i++) reader.Packed();
        }
        if (state.Name is "Control" or "Voice" || bunch.Channel == 0) return;
        if (bunch.Open && direction == "fromServer")
        {
            var oldClose = new DecodedRecord("actorClosed", bunch.Channel, state.ActorGuid, Detail: state.Kind, Direction: direction);
            identities.Close(bunch.Channel, state.ActorGuid);
            state.ResetLifetime();
            channels.Get("toServer", bunch.Channel).ResetLifetime();
            if (reader.Remaining == 0) { output.Add(oldClose); return; }
            ActorSpawn spawn;
            try { reader.Bits(1); spawn = SpawnReader.Read(reader, cache, bunch.Close); }
            catch (Exception ex) when (ex is IOException or InvalidDataException or ArgumentException or OverflowException)
            { output.Add(oldClose); throw; }
            state.ActorGuid = spawn.ActorGuid;
            state.ArchetypeGuid = spawn.ArchetypeGuid;
            var path = Path(state);
            state.Kind = Classify(path);
            output.Add(new(spawn.Destroyed ? "actorClosed" : "actorOpened", bunch.Channel, state.ActorGuid, path, Location: spawn.Location, Detail: state.Kind, Direction: direction, CloseReason: bunch.CloseReason, SpawnLocationPresent: spawn.LocationPresent));
            if (path.Contains("PlayerController", StringComparison.Ordinal) && reader.Remaining > 0) reader.Bits(8);
        }
        if (direction == "toServer")
        {
            var peer = channels.Get("fromServer", bunch.Channel);
            state.ActorGuid = peer.ActorGuid;
            state.ArchetypeGuid = peer.ArchetypeGuid;
            state.Kind = peer.Kind;
            state.MetadataConflict |= peer.MetadataConflict;
        }
        while (reader.Remaining > 0)
        {
            var replication = reader.Bits(1) != 0;
            var isActor = reader.Bits(1) != 0;
            uint objectGuid = 0;
            uint classGuid = 0;
            var deleted = false;
            if (!isActor)
            {
                objectGuid = cache.Load(reader);
                if (direction == "fromServer" && reader.Bits(1) == 0) deleted = (classGuid = cache.Load(reader)) == 0;
            }
            var block = reader.Fork(deleted ? 0 : checked((int)reader.Packed()));
            if (deleted) { state.Subobjects.Remove(objectGuid); state.SubobjectClasses.Remove(objectGuid); }
            if (!isActor && objectGuid != 0 && !deleted && direction == "fromServer")
            {
                if (state.Subobjects.Count < 64) state.Subobjects.Add(objectGuid);
                if (classGuid != 0 && state.SubobjectClasses.Count < 64) state.SubobjectClasses[objectGuid] = classGuid;
                Refresh(direction, bunch.Channel, state, output);
            }
            if (deleted || block.Remaining == 0) continue;
            if (!isActor)
            {
                var componentClasses = direction == "toServer" ? channels.Get("fromServer", bunch.Channel).SubobjectClasses : state.SubobjectClasses;
                var knownClass = componentClasses.GetValueOrDefault(objectGuid);
                if (!state.MetadataConflict)
                    ComponentDecoder.Read(direction, bunch.Channel, state.ActorGuid, objectGuid,
                        cache.Path(classGuid != 0 ? classGuid : knownClass != 0 ? knownClass : objectGuid), state.Kind ?? (state.ProvisionalPawn ? "pawn" : null),
                        replication, block, completionOrdinal ?? ordinal, cache, output, state.ProvisionalPawn);
                continue;
            }
            ReadBlock(direction, bunch.Channel, state, replication, block, ordinal, output, completionOrdinal ?? ordinal);
        }
        if (!bunch.Close) return;
        output.Add(new("actorClosed", bunch.Channel, state.ActorGuid, Detail: state.Kind ?? (state.ProvisionalPawn ? "pawn" : null), Direction: direction, CloseReason: bunch.CloseReason));
        if (direction == "fromServer")
        {
            identities.Close(bunch.Channel, state.ActorGuid);
            channels.Get("toServer", bunch.Channel).ResetLifetime();
        }
        state.ResetLifetime();
    }

    private void ReadBlock(string direction, int channel, ChannelState state, bool replication, BitReader block, long ordinal, List<DecodedRecord> output, long completionOrdinal)
    {
        if (state.MetadataConflict) return;
        if (direction == "fromServer" && replication && (state.Kind is null || identities.Contains(channel))
            && identities.Observe(channel, state, block, channels,
                new(direction, channel, state.ActorGuid, state.ActorGuid, Path(state), 0, block.SizeBits, block.SizeBits,
                    completionOrdinal, "typedPlayerStateProfile", RawBody: Convert.ToBase64String(block.Data)), output)) return;
        if (state.Kind is null)
        {
            var wasAdmitted = state.ProvisionalPawn;
            var recovered = ProvisionalMovement.Read(direction, replication, block, state, ordinal);
            if (!state.ProvisionalPawn) return;
            if (!wasAdmitted) output.Add(new("actorResolved", channel, state.ActorGuid, Detail: "pawn", Direction: direction, Provisional: true));
            var fields = recovered.Properties?.Fields is { } values ? new Dictionary<string, object?>(values) : new();
            if (!wasAdmitted && direction == "fromServer" && state.PlayerStateGuid is { } guid) fields["playerStateGuid"] = guid;
            Properties(direction, channel, state, fields, output, true);
            foreach (var (id, movement) in recovered.Movements) Position(direction, channel, state, id, movement, output, true);
            return;
        }
        if (replication && direction == "fromServer")
        {
            var property = ReplicationReader.Read(block, state.Kind, cache);
            if (state.Kind == "playerState" && !property.Fields.ContainsKey("playFabIdentity") && property.StopReason?.StartsWith("No playerState schema", StringComparison.Ordinal) == true && PlayerStateIdentity.ReadBoundedTail(block, property.ConsumedBits) is { } identity)
                property.Fields["playFabIdentity"] = identity;
            Properties(direction, channel, state, property.Fields, output, false,
                new(direction, channel, state.ActorGuid, state.ActorGuid, Path(state), 0, property.ConsumedBits, block.SizeBits,
                    completionOrdinal, property.Complete ? "observedProfile" : "partial", RawBody: Convert.ToBase64String(block.Data)));
            if (!property.Complete)
            {
                output.Add(new("decoderUnsupported", channel, state.ActorGuid, Detail: $"{property.StopReason}; prefix {property.ConsumedBits}, total {block.SizeBits} bits", Direction: direction,
                    Evidence: new(direction, channel, state.ActorGuid, state.ActorGuid, Path(state), property.ConsumedBits, block.SizeBits, block.SizeBits,
                        completionOrdinal, "opaque", RawBody: Convert.ToBase64String(block.Data))));
                return;
            }
        }
        if (state.Kind != "pawn" || block.Remaining == 0) return;
        foreach (var field in RpcReader.Read(block, 96))
        {
            var movement = RpcDecoderRegistry.Read(direction, field.Id, field.Data, cache);
            if (movement?.Location is not null) Position(direction, channel, state, field.Id, movement, output, false);
        }
    }

    private void Properties(string direction, int channel, ChannelState state, Dictionary<string, object?> fields, List<DecodedRecord> output, bool provisional, ObservationSource? evidence = null)
    {
        if (fields.Count == 0) return;
        var pawn = state.Kind == "pawn" || provisional;
        if (direction == "fromServer" && pawn && fields.GetValueOrDefault("playerStateGuid") is uint guid)
        {
            state.PlayerStateGuid = guid;
            identities.Link(guid, channels, output);
        }
        output.Add(new("properties", channel, state.ActorGuid, Fields: fields, Detail: provisional ? "pawn" : state.Kind, Direction: direction, Provisional: provisional, Evidence: evidence));
        if (pawn && fields.GetValueOrDefault("replicatedMovement") is Vec3 location)
            output.Add(new("position", channel, state.ActorGuid, Location: location, Source: "replicatedMovementProperty", Direction: direction, Provisional: provisional));
    }

    private static void Position(string direction, int channel, ChannelState state, int id, MovementResult movement, List<DecodedRecord> output, bool provisional) =>
        output.Add(new("position", channel, state.ActorGuid, Location: movement.Location, Source: direction == "toServer" ? $"serverMove{id}" : "fastSharedRpc73Prefix", BaseGuid: movement.BaseGuid, Detail: movement.RemainingBits > 0 ? $"Unknown native tail: {movement.RemainingBits} bits" : null, Direction: direction, Provisional: provisional));

    private void Refresh(string direction, int channel, ChannelState state, List<DecodedRecord> output)
    {
        if (state.MetadataConflict) return;
        var priorActor = state.ActorGuid;
        var priorKind = state.Kind;
        var owners = state.Subobjects.Select(cache.Owner).Where(owner => owner is > 0).Distinct().Take(2).ToArray();
        var ownerChanged = state.ActorGuidRecovered && owners.Any(owner => owner != state.ActorGuid);
        if (ownerChanged || owners.Length > 1 && state.ActorGuid == 0)
        {
            output.Add(new("actorClosed", channel, state.ActorGuid, Direction: direction));
            output.Add(new("decoderUnsupported", channel, Detail: "Conflicting component outers; provisional lifetime stopped", Direction: direction));
            identities.Close(channel, state.ActorGuid);
            state.ResetLifetime();
            state.MetadataConflict = true;
            if (direction == "fromServer")
            {
                var peer = channels.Get("toServer", channel);
                peer.ResetLifetime();
                peer.MetadataConflict = true;
            }
            return;
        }
        if (state.ActorGuid == 0)
        {
            if (owners.Length == 1) { state.ActorGuid = owners[0]!.Value; state.ActorGuidRecovered = true; }
        }
        state.Kind = Classify(Path(state)) ?? state.Kind;
        if (direction == "fromServer")
        {
            identities.ValidateClass(channel, state, output);
            if (state.MetadataConflict) return;
        }
        if (state.ActorGuid == priorActor && state.Kind == priorKind) return;
        output.Add(new("actorResolved", channel, state.ActorGuid, Path(state), Detail: state.Kind ?? (state.ProvisionalPawn ? "pawn" : "unknown"), Direction: direction, Provisional: state.Kind is null && state.ProvisionalPawn));
        if (direction == "fromServer" && priorActor == 0 && state.ActorGuid != 0) identities.EmitRetained(channel, state, output);
    }

    private string Path(ChannelState state) => cache.Path(state.ArchetypeGuid != 0 ? state.ArchetypeGuid : state.ActorGuid);
    private static string? Classify(string path) => path.StartsWith("NetGUID:", StringComparison.Ordinal) ? null
        : path.EndsWith("Default__TBLPlayerState", StringComparison.Ordinal) ? "playerState"
        : path.Contains("/Game/Characters/Classes/Subclasses/", StringComparison.Ordinal) ? "pawn"
        : ItemClassification.IsItemPath(path) ? "item" : "actor";
}
