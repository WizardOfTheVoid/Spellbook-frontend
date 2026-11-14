using System.Buffers.Binary;
namespace SpellBook.Telemetry;

public class MidSessionRecoveryTests
{
    [Fact] public void AdmitsUnknownMovementOnlyAfterThreeDistinctPackets()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(1, copies: 3)), row => row.Kind == "position");
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(2)), row => row.Kind == "position");
        var position = Assert.Single(decoder.Accept(RecoveryPackets.Movement(3)), row => row.Kind == "position");
        Assert.Equal(new Vec3(1, 2, 3), position.Location);
        Assert.True(position.Provisional);
        Assert.Equal(0u, position.ActorGuid);
    }

    [Fact] public void MalformedRpcEnvelopeDoesNotCountTowardAdmission()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        decoder.Accept(RecoveryPackets.Movement(1, malformed: true));
        decoder.Accept(RecoveryPackets.Movement(2));
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(3)), row => row.Kind == "position");
        Assert.Contains(decoder.Accept(RecoveryPackets.Movement(4)), row => row.Kind == "position");
    }

    [Fact] public void ReorderedBunchesFromOnePacketCountOnlyOnce()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        decoder.Accept(RecoveryPackets.Movement(1, reliableSequence: 1));
        decoder.Accept(RecoveryPackets.Movement(2, reliableSequence: 3));
        decoder.Accept(RecoveryPackets.Movement(2, reliableSequence: 5));
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Packet(3, new([]), reliableSequence: 2)), row => row.Kind == "position");
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Packet(4, new([]), reliableSequence: 4)), row => row.Kind == "position");
        Assert.Contains(decoder.Accept(RecoveryPackets.Movement(5, reliableSequence: 6)), row => row.Kind == "position");
    }

    [Fact] public void CaptureGapAndChannelCloseResetAdmission()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        decoder.Accept(RecoveryPackets.Movement(1));
        decoder.Accept(RecoveryPackets.Movement(2));
        Assert.Contains(decoder.Accept(RecoveryPackets.Movement(3)), row => row.Kind == "position");
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(4) with { LossCount = 1 }), row => row.Kind == "position");
        decoder.Accept(RecoveryPackets.Movement(5));
        decoder.Accept(RecoveryPackets.Packet(6, new BitReader([]), close: true));
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(7)), row => row.Kind == "position");
    }

    [Theory]
    [InlineData("/Script/Engine.Actor", false)]
    [InlineData("/Game/Characters/Classes/Subclasses/Default__Footman", true)]
    public void KnownClassControlsTheStrongPath(string path, bool pawn)
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        decoder.Accept(RecoveryPackets.Export(1, 37, 0, path));
        decoder.Accept(RecoveryPackets.Open(2, 100, 37));
        for (var ordinal = 3; ordinal < 7; ordinal++)
        {
            var positions = decoder.Accept(RecoveryPackets.Movement(ordinal)).Where(row => row.Kind == "position").ToArray();
            Assert.Equal(pawn ? 1 : 0, positions.Length);
            Assert.All(positions, row => Assert.False(row.Provisional));
        }
    }

    [Fact] public void IncomingPawnReferenceValidatesDelayedTypedStateBeforeTheSameBlockPosition()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        var tracker = new TrackingOrchestrator();
        IReadOnlyList<TrackedRecord> Feed(PacketEnvelope packet) => decoder.Accept(packet).SelectMany(row => tracker.Apply(row, packet)).ToArray();
        Feed(RecoveryPackets.Open(1, 200, 37, 9));
        var identity = new WireFixture().Bits(0, 1).Packed(44).Identity("ABCDEF1234567890").Packed(0).Reader();
        var unbound = Feed(RecoveryPackets.Packet(2, RecoveryPackets.Block(identity, true), channel: 9));
        Assert.DoesNotContain(unbound, row => row.Entity?.PlayFabId is not null);
        Feed(RecoveryPackets.Movement(3));
        Feed(RecoveryPackets.Movement(4));
        var linked = Assert.Single(Feed(RecoveryPackets.Movement(5, playerState: 200)), row => row.Position is not null).Position!;
        Assert.Equal("ABCDEF1234567890", linked.PlayFabId);
        Assert.Equal(200u, linked.PlayerStateGuid);
        var cleared = Assert.Single(Feed(RecoveryPackets.Movement(6, playerState: 0)), row => row.Position is not null).Position!;
        Assert.Null(cleared.PlayFabId);
        Assert.Null(cleared.PlayerStateGuid);
    }

    [Fact] public void LateComponentOuterUpgradesTheSameAnonymousEntity()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        var tracker = new TrackingOrchestrator();
        IReadOnlyList<TrackedRecord> Feed(PacketEnvelope packet) => decoder.Accept(packet).SelectMany(row => tracker.Apply(row, packet)).ToArray();
        Feed(RecoveryPackets.Movement(1));
        Feed(RecoveryPackets.Movement(2));
        var anonymous = Assert.Single(Feed(RecoveryPackets.Movement(3)), row => row.Position is not null).Entity!;
        var subobject = new RecoveryBits().Bits(0, 1).Bits(0, 1).Packed(202).Bits(1, 1).Packed(0).Reader();
        Feed(RecoveryPackets.Packet(4, subobject));
        Feed(RecoveryPackets.Export(5, 202, 100, "CharMoveComp"));
        var resolved = Assert.Single(Feed(RecoveryPackets.Movement(6)), row => row.Position is not null).Entity!;
        Assert.Equal(anonymous.EntityId, resolved.EntityId);
        Assert.Equal(100u, resolved.ActorGuid);
        Assert.Null(resolved.PlayFabId);
    }

    [Fact] public void OppositeDirectionsNeedIndependentEvidenceAndKeepUnresolvedBases()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        decoder.Accept(RecoveryPackets.Movement(1));
        decoder.Accept(RecoveryPackets.Movement(2));
        decoder.Accept(RecoveryPackets.Movement(3));
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.OutgoingMovement(4)), row => row.Kind == "position");
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.OutgoingMovement(5)), row => row.Kind == "position");
        var result = Assert.Single(decoder.Accept(RecoveryPackets.OutgoingMovement(6)), row => row.Kind == "position");
        Assert.Equal("toServer", result.Direction);
        Assert.Equal(900u, result.BaseGuid);
        var packet = RecoveryPackets.OutgoingMovement(6);
        var position = new TrackingOrchestrator().Apply(result, packet).Single().Position!;
        Assert.Equal("unknown", position.CoordinateSpace);
    }

    [Fact] public void ConflictingComponentOutersStopTheUnprovenActorLifetime()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        decoder.Accept(RecoveryPackets.Movement(1));
        decoder.Accept(RecoveryPackets.Movement(2));
        decoder.Accept(RecoveryPackets.Movement(3));
        decoder.Accept(RecoveryPackets.Export(4, 202, 100, "CharMoveComp"));
        var first = new RecoveryBits().Bits(0, 1).Bits(0, 1).Packed(202).Bits(1, 1).Packed(0).Reader();
        decoder.Accept(RecoveryPackets.Packet(5, first));
        decoder.Accept(RecoveryPackets.Export(6, 302, 300, "CharMoveComp"));
        var second = new RecoveryBits().Bits(0, 1).Bits(0, 1).Packed(302).Bits(1, 1).Packed(0).Reader();
        var conflict = decoder.Accept(RecoveryPackets.Packet(7, second));
        Assert.Contains(conflict, row => row.Kind == "actorClosed");
        for (var ordinal = 8; ordinal < 12; ordinal++) Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(ordinal)), row => row.Kind == "position");
    }

    [Fact] public void ReassignedComponentOuterStopsThePreviouslyRecoveredActor()
    {
        var decoder = new DecodingOrchestrator(new("10.0.0.1", 7777));
        decoder.Accept(RecoveryPackets.Movement(1));
        decoder.Accept(RecoveryPackets.Movement(2));
        decoder.Accept(RecoveryPackets.Movement(3));
        decoder.Accept(RecoveryPackets.Export(4, 202, 100, "CharMoveComp"));
        var subobject = new RecoveryBits().Bits(0, 1).Bits(0, 1).Packed(202).Bits(1, 1).Packed(0).Reader();
        decoder.Accept(RecoveryPackets.Packet(5, subobject));
        var conflict = decoder.Accept(RecoveryPackets.Export(6, 202, 300, "CharMoveComp"));
        Assert.Contains(conflict, row => row.Kind == "actorClosed" && row.ActorGuid == 100);
        for (var ordinal = 7; ordinal < 11; ordinal++) Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(ordinal)), row => row.Kind == "position");
    }
}

public static class RecoveryPackets
{
    public static PacketEnvelope Movement(long ordinal, int copies = 1, bool malformed = false, uint? playerState = null, int? reliableSequence = null)
    {
        var payload = new RecoveryBits().Bits(1, 1).Bits(0, 2).Vector().Bits(0, 1).Int(0, 16).Bits(2, 2).Bits(2, 2).Bits(2, 2).Reader();
        var rpc = new RecoveryBits();
        if (playerState is { } guid) rpc.Bits(0, 1).Packed(17).Packed(guid).Packed(0);
        for (var i = 0; i < copies; i++) rpc.Int(73, 96).Packed((uint)payload.SizeBits).Append(payload);
        if (malformed) rpc.Bits(1, 1);
        return Packet(ordinal, Block(rpc.Reader(), playerState is not null), reliableSequence: reliableSequence);
    }

    public static PacketEnvelope Export(long ordinal, uint guid, uint outer, string name)
    {
        var data = new RecoveryBits().Bits(0, 1).Bits(1, 32).Packed(guid).Bits(1, 8).Packed(outer);
        if (outer != 0) data.Bits(0, 8);
        return Packet(ordinal, data.Text(name).Reader(), channel: 0, exports: true);
    }

    public static PacketEnvelope Open(long ordinal, uint actor, uint archetype, int channel = 7) =>
        Packet(ordinal, new RecoveryBits().Bits(0, 1).Packed(actor).Packed(archetype).Packed(0).Bits(0, 4).Reader(), channel, open: true);

    public static PacketEnvelope OutgoingMovement(long ordinal)
    {
        var payload = new RecoveryBits().Bits(0, 2).Bits(1, 1).Vector().Bits(0, 3).Bits(1, 1).Packed(900).Bits(0, 2).Reader();
        var rpc = new RecoveryBits().Int(32, 96).Packed((uint)payload.SizeBits).Append(payload).Reader();
        return Packet(ordinal, Block(rpc), direction: "toServer");
    }

    public static BitReader Block(BitReader data, bool replication = false) => new RecoveryBits().Bits(replication ? 1u : 0u, 1).Bits(1, 1).Packed((uint)data.SizeBits).Append(data).Reader();

    public static PacketEnvelope Packet(long ordinal, BitReader content, int channel = 7, bool close = false, bool open = false, bool exports = false, string direction = "fromServer", int? reliableSequence = null)
    {
        var wire = new RecoveryBits().Bits(0, direction == "fromServer" ? 10 : 42).Bits(0, 32).Bits(0, 32).Bits(0, 1);
        wire.Bits(open || close ? 1u : 0u, 1);
        if (open || close) wire.Bits(open ? 1u : 0u, 1).Bits(close ? 1u : 0u, 1);
        if (close) wire.Int(0, 15);
        wire.Bits(0, 1).Bits(reliableSequence is null ? 0u : 1u, 1).Packed((uint)channel).Bits(exports ? 1u : 0u, 1).Bits(0, 1).Bits(0, 1);
        if (reliableSequence is { } sequence) wire.Bits((uint)sequence, 10);
        if (open || reliableSequence is not null) wire.Bits(1, 1).Packed(102);
        var payload = wire.Int(content.SizeBits, 8192).Append(content).Bits(3, 2).Reader().Data;
        var bytes = new byte[28 + payload.Length];
        bytes[0] = 0x45; bytes[9] = 17;
        BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(2), (ushort)bytes.Length);
        bytes[12] = bytes[16] = 10;
        bytes[15] = (byte)(direction == "fromServer" ? 1 : 2);
        bytes[19] = (byte)(direction == "fromServer" ? 2 : 1);
        BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(20), (ushort)(direction == "fromServer" ? 7777 : 50000));
        BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(22), (ushort)(direction == "fromServer" ? 50000 : 7777));
        BinaryPrimitives.WriteUInt16BigEndian(bytes.AsSpan(24), (ushort)(8 + payload.Length));
        payload.CopyTo(bytes, 28);
        return new(ordinal, ordinal * 1000, DateTimeOffset.UnixEpoch.AddMilliseconds(ordinal), 101, bytes.Length, bytes);
    }
}

public sealed class RecoveryBits
{
    private readonly WireFixture wire = new();
    public RecoveryBits Bits(ulong value, int count) { wire.Bits(value, count); return this; }
    public RecoveryBits Packed(uint value) { wire.Packed(value); return this; }
    public RecoveryBits Text(string value) { wire.Text(value); return this; }
    public RecoveryBits Int(int value, int maximum)
    {
        var emitted = 0;
        for (var mask = 1; emitted + mask < maximum; mask <<= 1)
        {
            var bit = value & mask;
            Bits(bit != 0 ? 1u : 0u, 1);
            emitted |= bit;
        }
        return this;
    }
    public RecoveryBits Append(BitReader reader) { for (var i = 0; i < reader.SizeBits; i++) Bits((uint)(reader.Data[i / 8] >> (i % 8) & 1), 1); return this; }
    public RecoveryBits Vector() => Int(10, 30).Bits(2148, 12).Bits(2248, 12).Bits(2348, 12);
    public BitReader Reader() => wire.Reader();
}
