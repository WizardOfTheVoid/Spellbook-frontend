namespace SpellBook.Telemetry;

public static class PlayerStateReverseReference
{
    public static (uint? StateGuid, bool Conflict) Resolve(ChannelTracker channels, uint pawn)
    {
        var matches = channels.All
            .Where(pair => pair.Key.Direction == "fromServer" && pair.Value.ActorGuid == pawn
                && !pair.Value.MetadataConflict && (pair.Value.Kind == "pawn" || pair.Value.ProvisionalPawn))
            .Select(pair => pair.Value.PlayerStateGuid).Distinct().Take(2).ToArray();
        if (matches.Length != 1) return (null, matches.Length > 1);
        return (matches[0] is > 0 ? matches[0] : null, false);
    }
}
