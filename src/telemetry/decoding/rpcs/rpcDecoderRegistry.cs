namespace SpellBook.Telemetry;
public static class RpcDecoderRegistry
{
    public static MovementResult? Read(string direction, int id, BitReader reader, NetGuidCache cache) => (direction, id) switch
    {
        ("toServer", 32 or 33 or 37) => ServerMoveRpc.Read(id, reader, cache),
        ("fromServer", 73) => FastSharedMovementRpc.Read(reader),
        _ => null
    };
}
