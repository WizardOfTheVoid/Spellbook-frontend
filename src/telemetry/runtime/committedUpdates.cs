using System.Collections.Concurrent;
using System.Threading.Channels;
namespace SpellBook.Telemetry;

public sealed record CommittedProjection(RecordingStatus Status,IReadOnlyList<TelemetryEntity> Entities,IReadOnlyList<PlayerStateSnapshot> Players);
public static class CommittedUpdates
{
    private static readonly ConcurrentDictionary<string,CommittedProjection> projections=new(StringComparer.OrdinalIgnoreCase);
    private static readonly ConcurrentDictionary<string,ConcurrentDictionary<Guid,Channel<bool>>> subscribers=new(StringComparer.OrdinalIgnoreCase);
    public static CommittedProjection? Get(string root)=>projections.GetValueOrDefault(Path.GetFullPath(root));
    public static void Publish(string root,RecordingStatus status,ProjectionWriter? projection=null)
    {
        var key=Path.GetFullPath(root);
        if(projection is not null) projections[key]=new(status with {},projection.Entities.Values.ToArray(),projection.Players.Values.Where(player=>player.Active).ToArray());
        if(subscribers.TryGetValue(status.Id,out var listeners))
            foreach(var listener in listeners.Values) listener.Writer.TryWrite(true);
    }
    public static void Release(string root)=>projections.TryRemove(Path.GetFullPath(root),out _);
    public static Subscription Subscribe(string id)
    {
        var key=Guid.NewGuid();
        var channel=Channel.CreateBounded<bool>(new BoundedChannelOptions(1){FullMode=BoundedChannelFullMode.DropOldest,SingleReader=true});
        var listeners=subscribers.GetOrAdd(id,_=>new());
        listeners[key]=channel;
        return new(channel,()=>listeners.TryRemove(key,out _));
    }
    public sealed class Subscription(Channel<bool> channel,Action release):IDisposable
    {
        public async Task Wait(CancellationToken ct)=>await channel.Reader.ReadAsync(ct);
        public void Dispose()=>release();
    }
}
