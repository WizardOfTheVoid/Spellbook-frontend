namespace SpellBook.Telemetry;
public record IdentityProof(string PlayFabId, string? Name, long KnownAtUs);
public sealed class IdentityResolver
{
    private readonly Dictionary<uint, IdentityProof> states = [];
    private readonly Dictionary<string, uint> links = [];
    private readonly HashSet<uint> conflicts = [];
    public bool Remember(uint state, UniqueNetId id, string? name, long atUs)
    {
        if (state == 0 || id.Type != "PlayFab" || !Wire.IsPlayFabId(id.Id)) return false;
        if (conflicts.Contains(state)) return false;
        var value = id.Id!.ToUpperInvariant();
        if (states.TryGetValue(state, out var old) && old.PlayFabId != value) { Quarantine(state); return false; }
        states[state] = new(value, name ?? old?.Name, atUs); return true;
    }
    public void Link(string entity, uint state) { if (state == 0) links.Remove(entity); else links[entity] = state; }
    public void ObserveName(uint state, string name)
    {
        if (states.TryGetValue(state, out var proof)) states[state] = proof with { Name = name };
    }
    public void Unlink(string entity) => links.Remove(entity);
    public bool IsConflicted(uint state) => conflicts.Contains(state);
    public bool Contradicts(uint state, string account) => conflicts.Contains(state)
        || states.TryGetValue(state, out var proof) && !string.Equals(proof.PlayFabId, account, StringComparison.OrdinalIgnoreCase);
    public void Quarantine(uint state) { if (state != 0) { states.Remove(state); conflicts.Add(state); } }
    public uint? State(string entity) => links.TryGetValue(entity, out var state) ? state : null;
    public IdentityProof? Resolve(string entity) => links.TryGetValue(entity, out var state) ? states.GetValueOrDefault(state) : null;
    public void CloseState(uint state)
    {
        states.Remove(state); conflicts.Remove(state);
        foreach(var link in links.Where(pair=>pair.Value==state).ToArray()) links.Remove(link.Key);
    }
    public void Clear() { states.Clear(); links.Clear(); conflicts.Clear(); }
}
