namespace SpellBook.Telemetry;
public sealed class ChannelState
{
    public string? Name, Kind;
    public uint ActorGuid, ArchetypeGuid;
    public int? ReliableSequence;
    public Dictionary<int, (Bunch Bunch, long Ordinal)> Pending { get; } = [];
    public HashSet<long> MovementPackets { get; } = [];
    public HashSet<uint> Subobjects { get; } = [];
    public Dictionary<uint, uint> SubobjectClasses { get; } = [];
    public bool ProvisionalPawn;
    public bool ActorGuidRecovered, MetadataConflict;
    public uint? PlayerStateGuid;
    public void ResetLifetime()
    {
        ActorGuid = ArchetypeGuid = 0;
        Kind = null;
        ProvisionalPawn = false;
        ActorGuidRecovered = MetadataConflict = false;
        PlayerStateGuid = null;
        MovementPackets.Clear();
        Subobjects.Clear();
        SubobjectClasses.Clear();
    }
}
public sealed class ChannelTracker
{
    private readonly Dictionary<(string, int), ChannelState> channels = [];
    public IEnumerable<KeyValuePair<(string Direction, int Channel), ChannelState>> All => channels;
    public ChannelState Get(string direction, int channel)
    {
        var key = (direction, channel);
        if (!channels.TryGetValue(key, out var state)) channels[key] = state = new();
        return state;
    }
    public IEnumerable<Bunch> Order(string direction, Bunch bunch) => Order(direction, bunch, 0).Select(ordered => ordered.Bunch);
    public IEnumerable<(Bunch Bunch, long Ordinal)> Order(string direction, Bunch bunch, long ordinal)
    {
        var state = Get(direction, bunch.Channel);
        if (!bunch.Reliable) { yield return (bunch, ordinal); yield break; }
        if (state.ReliableSequence is { } prior)
        {
            var delta = (bunch.Sequence - prior + 1024) % 1024;
            if (delta == 0 || delta > 512) yield break;
            if (delta != 1)
            {
                if (state.Pending.Count >= 64) throw new InvalidDataException("Reliable reorder window exceeded");
                state.Pending.TryAdd(bunch.Sequence, (bunch, ordinal));
                yield break;
            }
        }
        state.ReliableSequence = bunch.Sequence;
        yield return (bunch, ordinal);
        while (state.Pending.Remove((state.ReliableSequence.Value + 1) % 1024, out var next))
        {
            state.ReliableSequence = next.Bunch.Sequence;
            yield return next;
        }
    }
}
