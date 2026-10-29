namespace SpellBook.Telemetry;

public sealed class BoundedIdentityRecovery
{
    private sealed record Candidate(uint ActorGuid, UniqueNetId Identity, ObservationSource Proof, string? Name)
    {
        public bool Emitted;
    }

    private readonly Dictionary<int, Candidate> candidates = [];
    public bool Conflicts(int channel, UniqueNetId identity) => candidates.TryGetValue(channel, out var old)
        && !string.Equals(old.Identity.Id, identity.Id, StringComparison.OrdinalIgnoreCase);

    public bool Observe(int channel, ChannelState state, BitReader block, ChannelTracker channels, ObservationSource source, List<DecodedRecord> output)
    {
        if (state.ActorGuid == 0 || block.SizeBits > 32768) return false;
        var prefix = ReplicationReader.Read(new(block.Data, block.SizeBits), "actor", new());
        if (prefix.StopReason?.StartsWith("No actor schema", StringComparison.Ordinal) != true
            || PlayerStateIdentity.ReadBoundedTail(block, prefix.ConsumedBits) is not { } identity) return false;
        if (candidates.TryGetValue(channel, out var old))
        {
            if (Conflicts(channel, identity)) return true;
        }
        else
        {
            if (candidates.Count >= 1024) return false;
            var statePrefix = ReplicationReader.Read(new(block.Data, block.SizeBits), "playerState", new());
            candidates[channel] = new(state.ActorGuid, identity, source with { Coverage = "retainedPlayerStateIdentity" },
                statePrefix.Fields.GetValueOrDefault("playerName") as string);
        }
        Emit(state.ActorGuid, channels, output);
        return false;
    }

    public void Emit(uint guid, ChannelTracker channels, List<DecodedRecord> output)
    {
        if (guid == 0 || !channels.All.Any(pair => pair.Key.Direction == "fromServer" && !pair.Value.MetadataConflict
            && (pair.Value.Kind == "pawn" || pair.Value.ProvisionalPawn) && pair.Value.PlayerStateGuid == guid)) return;
        foreach (var (channel, candidate) in candidates.Where(pair => pair.Value.ActorGuid == guid && !pair.Value.Emitted))
        {
            var state = channels.Get("fromServer", channel);
            if (state.ActorGuid != guid || state.MetadataConflict || state.Kind is not null || state.ProvisionalPawn) continue;
            candidate.Emitted = true;
            var fields = new Dictionary<string, object?> { ["playFabIdentity"] = candidate.Identity };
            if (candidate.Name is not null) fields["playerName"] = candidate.Name;
            output.Add(new("properties", channel, guid, Fields: fields, Detail: "playerState", Evidence: candidate.Proof));
        }
    }

    public void Close(int channel) => candidates.Remove(channel);
}
