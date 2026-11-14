namespace SpellBook.Telemetry;

public sealed class PlayerInventoryTracker(Func<uint, string?> resolveClass)
{
    private readonly Dictionary<uint, HashSet<string>> holders = [];
    private readonly Dictionary<string, uint[]> references = [];
    private readonly Dictionary<string, HashSet<int>> invalidatedSlots = [];

    public IReadOnlyList<string> Holders(uint guid) =>
        holders.TryGetValue(guid, out var entities) ? entities.ToArray() : [];

    public void Invalidate(PlayerStateSnapshot player, uint guid)
    {
        if (player.Inventory is not { } inventory) return;
        foreach (var slot in inventory.Where(slot => slot.ItemGuid == guid))
        {
            if (!invalidatedSlots.TryGetValue(player.EntityId, out var blocked)) invalidatedSlots[player.EntityId] = blocked = [];
            blocked.Add(slot.Index);
        }
    }

    public PlayerStateSnapshot Observe(PlayerStateSnapshot player, SparseValues? assigned = null)
    {
        if (invalidatedSlots.TryGetValue(player.EntityId, out var blocked))
        {
            if (assigned is not null)
                foreach (var update in assigned.Updates) blocked.Remove(update.Index);
            blocked.RemoveWhere(index => player.Inventory?.Any(slot => slot.Index == index && slot.ItemGuid is > 0) != true);
            if (!player.Active || blocked.Count == 0) invalidatedSlots.Remove(player.EntityId);
        }
        var current = player.Active
            ? player.Inventory?.Where(slot => slot.ItemGuid is > 0).Select(slot => slot.ItemGuid!.Value).Distinct().ToArray() ?? []
            : [];
        var previous = references.GetValueOrDefault(player.EntityId) ?? [];
        if (!previous.SequenceEqual(current))
        {
            foreach (var guid in previous)
                if (holders.TryGetValue(guid, out var entities))
                {
                    entities.Remove(player.EntityId);
                    if (entities.Count == 0) holders.Remove(guid);
                }
            if (current.Length == 0) references.Remove(player.EntityId);
            else references[player.EntityId] = current;
            foreach (var guid in current)
            {
                if (!holders.TryGetValue(guid, out var entities)) holders[guid] = entities = [];
                entities.Add(player.EntityId);
            }
        }
        return player.Active ? Resolve(player) : player;
    }

    public PlayerStateSnapshot Resolve(PlayerStateSnapshot player)
    {
        if (player.Inventory is not { } inventory) return player;
        InventorySlot[]? changed = null;
        for (var index = 0; index < inventory.Count; index++)
        {
            var slot = inventory[index];
            var invalidated = invalidatedSlots.TryGetValue(player.EntityId, out var blocked) && blocked.Contains(slot.Index);
            var path = !invalidated && slot.ItemGuid is uint guid && guid > 0 ? resolveClass(guid) : null;
            if (slot.ClassPath == path) continue;
            changed ??= inventory.ToArray();
            changed[index] = slot with { ClassPath = path };
        }
        return changed is null ? player : player with { Inventory = changed };
    }

    public void Clear()
    {
        holders.Clear();
        references.Clear();
        invalidatedSlots.Clear();
    }
}
