namespace SpellBook.Telemetry;

public record ItemEventDraft(string Kind, string Detail, ItemEventData? Item = null, int Count = 1);

public sealed class ItemTracker(int capacity = 16384)
{
    private sealed class Entry(string path, LinkedListNode<uint> node)
    {
        public string Path = path;
        public LinkedListNode<uint> Node = node;
        public int Channel;
        public bool Active, Destroyed;
        public bool ConfirmedItem = ItemClassification.IsItemPath(path);
        public int? CloseReason;
        public uint? Owner, Instigator;
    }

    private readonly int maxItems = capacity is > 0 and <= 65536 ? capacity : throw new ArgumentOutOfRangeException(nameof(capacity));
    private readonly Dictionary<uint, Entry> items = [];
    private readonly LinkedList<uint> recent = [];
    private bool evicted;
    private long? lastLossOrdinal;
    public int RetainedCount => items.Count;
    public uint? EvictedGuid { get; private set; }
    public uint? ReusedGuid { get; private set; }
    public string? ClassPath(uint actorGuid) =>
        items.TryGetValue(actorGuid, out var item) && item.ConfirmedItem && !item.Destroyed && (item.Active || item.CloseReason == 1)
            ? item.Path : null;
    public bool IsKnownItem(uint actorGuid) => items.TryGetValue(actorGuid, out var item) && item.ConfirmedItem;
    public bool IsTrackedObject(uint actorGuid) => items.ContainsKey(actorGuid);
    public bool IsDestroyed(uint actorGuid) => items.TryGetValue(actorGuid, out var item) && item.Destroyed;
    public static bool CanObserveUnknown(DecodedRecord decoded) =>
        decoded.Kind == "actorOpened" && decoded.Direction == "fromServer" && decoded.ActorGuid > 0 && (decoded.ActorGuid & 1) == 0 &&
        decoded.Detail is not ("pawn" or "playerState" or "item") &&
        decoded.Archetype is { } path && path.StartsWith("NetGUID:", StringComparison.Ordinal) &&
        uint.TryParse(path.AsSpan(8), out var archetype) && archetype > 0 && archetype != decoded.ActorGuid;

    public void Forget(uint actorGuid)
    {
        if (items.Remove(actorGuid, out var item)) recent.Remove(item.Node);
    }

    public void Clear()
    {
        items.Clear();
        recent.Clear();
        evicted = false;
        lastLossOrdinal = null;
        EvictedGuid = null;
        ReusedGuid = null;
    }

    public IReadOnlyList<ItemEventDraft> Apply(DecodedRecord decoded, PacketEnvelope packet, Func<uint, string?> resolvePawnAccount)
    {
        EvictedGuid = null;
        ReusedGuid = null;
        if (decoded.Kind == "captureGap") { Clear(); return []; }
        if (packet.LossCount > 0 && lastLossOrdinal != packet.Ordinal) { Clear(); lastLossOrdinal = packet.Ordinal; }
        if (decoded.Direction != "fromServer" || decoded.ActorGuid == 0) return [];
        var result = new List<ItemEventDraft>();
        var first = !items.TryGetValue(decoded.ActorGuid, out var entry);
        var confirmedItem = ItemClassification.IsItemPath(decoded.Archetype);
        if (!first && entry!.Destroyed && decoded.Kind == "actorOpened")
        {
            Forget(decoded.ActorGuid);
            ReusedGuid = decoded.ActorGuid;
            first = true;
            entry = null;
        }
        if (!first && !entry!.ConfirmedItem && !confirmedItem &&
            (decoded.Detail is "pawn" or "playerState" || decoded.Archetype is { } named && !named.StartsWith("NetGUID:", StringComparison.Ordinal)))
        {
            Forget(decoded.ActorGuid);
            return result;
        }
        if (first)
        {
            if (!(confirmedItem && decoded.Kind is "actorOpened" or "actorResolved") && !CanObserveUnknown(decoded)) return result;
            if (items.Count == maxItems)
            {
                var evictedGuid = recent.First!.Value;
                Forget(evictedGuid);
                EvictedGuid = evictedGuid;
                if (!evicted) result.Add(new("itemCoverageReset", "Object identity retention limit reached; first-observation history is incomplete"));
                evicted = true;
            }
            entry = new(decoded.Archetype!, recent.AddLast(decoded.ActorGuid));
            items.Add(decoded.ActorGuid, entry);
        }
        var item = entry!;
        recent.Remove(item.Node);
        recent.AddLast(item.Node);

        ItemEventData Data(string? attribution = null, string? account = null, int? closeReason = null, Vec3? location = null) =>
            new(item.Path, decoded.ActorGuid, item.Owner, item.Instigator, account, attribution, closeReason, location, decoded.SpawnLocationPresent);

        if (confirmedItem && !item.ConfirmedItem)
        {
            item.Path = decoded.Archetype!;
            item.ConfirmedItem = true;
            result.Add(new("itemClassified", "Previously observed unclassified object resolved to an item class", Data("classified")));
        }
        var prefix = item.ConfirmedItem ? "item" : "object";
        if (decoded.Kind == "actorOpened" || first && decoded.Kind == "actorResolved")
        {
            if (!first && item.Active && item.Channel == decoded.Channel) return result;
            item.Channel = decoded.Channel;
            item.Active = true;
            item.Destroyed = false;
            item.CloseReason = null;
            if (ItemClassification.IsItemPath(decoded.Archetype)) item.Path = decoded.Archetype!;
            var location = decoded.SpawnLocationPresent == true && decoded.Location is { IsFinite: true } value ? value : null;
            result.Add(new(first ? $"{prefix}Observed" : $"{prefix}Reappeared",
                first ? "Object first observed; creation time unknown" : "Previously observed object channel reopened",
                Data(first ? evicted ? "firstObservedAfterEviction" : "firstObserved" : "reappeared", location: location)));
        }
        else if (decoded.Kind == "actorClosed")
        {
            if (decoded.Channel != item.Channel && decoded.CloseReason != 0) return result;
            if (item.Destroyed || !item.Active && item.CloseReason == decoded.CloseReason) return result;
            item.Active = false;
            item.CloseReason = decoded.CloseReason;
            item.Destroyed = decoded.CloseReason == 0;
            var kind = decoded.CloseReason switch
            {
                0 => "Destroyed", 1 => "Dormant", 3 => "NoLongerRelevant", 4 => "TornOff", _ => "ChannelClosed"
            };
            result.Add(new($"{prefix}{kind}", "Observed object channel close", Data(closeReason: decoded.CloseReason)));
        }
        else if (decoded.Kind == "properties" && item.ConfirmedItem && item.Active && decoded.Channel == item.Channel && decoded.Fields is { } fields)
        {
            void Reference(string key, uint? previous, Action<uint> remember, string kind, string attribution)
            {
                if (!fields.TryGetValue(key, out var value) || value is not uint guid || previous == guid) return;
                remember(guid);
                result.Add(new(kind, "Replicated item relationship; creator unknown", Data(attribution, guid == 0 ? null : resolvePawnAccount(guid))));
            }
            Reference("ownerGuid", item.Owner, guid => item.Owner = guid, "itemOwnerChanged", "owner");
            Reference("instigatorGuid", item.Instigator, guid => item.Instigator = guid, "itemInstigatorChanged", "instigator");
        }
        return result;
    }
}
