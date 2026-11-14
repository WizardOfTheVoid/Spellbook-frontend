namespace SpellBook.Telemetry;

public sealed partial class PlayerTracker
{
    private readonly PlayerInventoryTracker inventory;

    public PlayerTracker(Func<uint, string?>? resolveItemClass = null)
    {
        inventory = new(resolveItemClass ?? (_ => null));
    }

    public void InvalidateInventory(uint itemGuid)
    {
        foreach (var entity in inventory.Holders(itemGuid))
            if (players.TryGetValue(entity, out var player) && player.Active) inventory.Invalidate(player, itemGuid);
    }

    public IReadOnlyList<PlayerStateSnapshot> RefreshInventory(uint itemGuid, PacketEnvelope packet, Func<long> nextSequence)
    {
        var result = new List<PlayerStateSnapshot>();
        foreach (var entity in inventory.Holders(itemGuid))
        {
            if (!players.TryGetValue(entity, out var prior) || !prior.Active) continue;
            var updated = inventory.Resolve(prior);
            if (ReferenceEquals(prior, updated)) continue;
            updated = updated with { ElapsedUs = packet.ElapsedUs, Sequence = nextSequence() };
            players[entity] = updated;
            result.Add(updated);
        }
        return result;
    }
}
