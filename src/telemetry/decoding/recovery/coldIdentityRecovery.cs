namespace SpellBook.Telemetry;

public sealed class ColdIdentityRecovery
{
    private sealed record Profile(UniqueNetId Identity, ObservationSource Proof)
    {
        public string? Name;
        public ObservationSource? NameProof;
    }

    private readonly Dictionary<int, Profile> profiles = [];
    private readonly BoundedIdentityRecovery bounded = new();
    public bool Contains(int channel) => profiles.ContainsKey(channel);

    public bool Observe(int channel, ChannelState state, BitReader block, ChannelTracker channels, ObservationSource source, List<DecodedRecord> output)
    {
        if (state.MetadataConflict || state.ProvisionalPawn) return false;
        profiles.TryGetValue(channel, out var profile);
        var parsed = block.SizeBits > 32768 ? new PropertyResult([], false, 0, "Profile exceeds recovery bound")
            : ReplicationReader.Read(new(block.Data, block.SizeBits), "playerState", new());
        if (!parsed.Complete || parsed.ConsumedBits != block.SizeBits)
        {
            if (profile is null)
            {
                if (bounded.Observe(channel, state, block, channels, source, output))
                    Quarantine(channel, state, output, "Conflicting bounded PlayerState identities");
                return state.MetadataConflict;
            }
            output.Add(new("decoderUnsupported", channel, state.ActorGuid, Detail: "Incomplete recovered PlayerState profile", Evidence: source with { Coverage = "opaque" }));
            return true;
        }
        var identity = parsed.Fields.GetValueOrDefault("playFabIdentity") as UniqueNetId;
        if (profile is null)
        {
            if (identity?.Type != "PlayFab" || !Wire.IsPlayFabId(identity.Id) || profiles.Count >= 1024) return false;
            if (bounded.Conflicts(channel, identity))
            {
                Quarantine(channel, state, output, "Conflicting bounded PlayerState identities");
                return true;
            }
            profiles[channel] = profile = new(identity, source);
            bounded.Close(channel);
            state.Kind = "playerState";
            state.PlayerStateGuid = null;
            state.MovementPackets.Clear();
        }
        else if (identity is not null && (identity.Type != profile.Identity.Type || !string.Equals(identity.Id, profile.Identity.Id, StringComparison.OrdinalIgnoreCase)))
        {
            Quarantine(channel, state, output, "Conflicting typed PlayerState identities");
            return true;
        }
        if (parsed.Fields.GetValueOrDefault("playerName") is string name) { profile.Name = name; profile.NameProof = source; }
        if (parsed.Fields.GetValueOrDefault("profileReference64") is uint pawn && pawn != 0)
        {
            var reverse = PlayerStateReverseReference.Resolve(channels, pawn);
            if (reverse.Conflict || reverse.StateGuid is { } other && state.ActorGuid != 0 && state.ActorGuid != other)
            {
                Quarantine(channel, state, output, "Conflicting reverse PlayerState references");
                return true;
            }
            if (state.ActorGuid == 0 && reverse.StateGuid is { } guid)
            {
                state.ActorGuid = guid;
                state.ActorGuidRecovered = true;
                output.Add(new("actorResolved", channel, guid, Detail: "playerState", Evidence: source with { ActorGuid = guid, ObjectGuid = guid, FieldId = 64 }));
                EmitRetained(channel, state, output, parsed.Fields);
            }
        }
        output.Add(new("properties", channel, state.ActorGuid, Fields: parsed.Fields, Detail: "playerState", Evidence: source with { ActorGuid = state.ActorGuid, ObjectGuid = state.ActorGuid }));
        return true;
    }

    public void Link(uint guid, ChannelTracker channels, List<DecodedRecord> output) => bounded.Emit(guid, channels, output);

    public void EmitRetained(int channel, ChannelState state, List<DecodedRecord> output, Dictionary<string, object?>? current = null)
    {
        if (!profiles.TryGetValue(channel, out var profile) || state.ActorGuid == 0) return;
        var remembered = new Dictionary<string, object?>();
        if (current?.ContainsKey("playFabIdentity") != true) remembered["playFabIdentity"] = profile.Identity;
        var replayName = profile.Name is not null && current?.ContainsKey("playerName") != true;
        if (replayName && profile.NameProof == profile.Proof) remembered["playerName"] = profile.Name;
        if (remembered.Count > 0)
            output.Add(new("properties", channel, state.ActorGuid, Fields: remembered, Detail: "playerState",
                Evidence: profile.Proof with { Coverage = "retainedPlayerStateIdentity" }));
        if (replayName && profile.NameProof is { } nameProof && nameProof != profile.Proof)
            output.Add(new("properties", channel, state.ActorGuid, Fields: new() { ["playerName"] = profile.Name }, Detail: "playerState",
                Evidence: nameProof with { Coverage = "retainedPlayerStateIdentity" }));
    }

    public void ValidateClass(int channel, ChannelState state, List<DecodedRecord> output)
    {
        if (profiles.ContainsKey(channel) && state.Kind is not (null or "playerState"))
            Quarantine(channel, state, output, "Actor class contradicts recovered PlayerState profile");
    }

    private void Quarantine(int channel, ChannelState state, List<DecodedRecord> output, string reason)
    {
        output.Add(new("actorClosed", channel, state.ActorGuid, Detail: "playerState"));
        output.Add(new("decoderUnsupported", channel, state.ActorGuid, Detail: reason));
        profiles.Remove(channel);
        bounded.Close(channel);
        state.ResetLifetime();
        state.MetadataConflict = true;
    }

    public void Close(int channel, uint actor)
    {
        profiles.Remove(channel);
        bounded.Close(channel);
    }
}
