namespace SpellBook.Telemetry;
public sealed class ActorLifetimes
{
    private readonly Dictionary<(string, int), TelemetryEntity> current = [];
    private long epoch;
    public TelemetryEntity? Current(int channel, string direction) => current.GetValueOrDefault((direction, channel));
    public TelemetryEntity Get(int channel, uint actor, string kind = "unknown", string direction = "fromServer", bool provisional = false)
    {
        var key = (direction, channel);
        var entity = current.GetValueOrDefault(key);
        if (entity is not { Active: true })
        {
            var peer = Current(channel, "fromServer");
            if (direction == "toServer" && actor != 0 && peer is { Active: true } && peer.ActorGuid == actor) return peer;
            entity = Open(channel, actor, kind, direction, provisional);
        }
        else
        {
            entity = entity with { ActorGuid = actor != 0 ? actor : entity.ActorGuid, Kind = kind != "unknown" ? kind : entity.Kind, Provisional = provisional };
            current[key] = entity;
        }
        return entity;
    }
    public TelemetryEntity Open(int channel, uint actor, string kind, string direction = "fromServer", bool provisional = false)
    {
        var entity = new TelemetryEntity($"{++epoch}:{direction}:{channel}:{actor}", actor, channel, kind, true, Direction: direction, Provisional: provisional);
        current[(direction, channel)] = entity; return entity;
    }
    public IEnumerable<TelemetryEntity> Close(int channel, string direction)
    {
        foreach (var key in current.Keys.Where(key => key.Item2 == channel && (key.Item1 == direction || direction == "fromServer")).ToArray())
        {
            var entity = current[key];
            if (!entity.Active) continue;
            current[key] = entity with { Active = false };
            yield return current[key];
        }
    }
    public void Set(TelemetryEntity entity) => current[(entity.Direction, entity.Channel)] = entity;
    public IEnumerable<TelemetryEntity> All => current.Values;
    public void Clear() => current.Clear();
}
