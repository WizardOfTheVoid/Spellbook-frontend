namespace SpellBook.Telemetry;

public class PlayerStateRecoveryTests
{
    private const string Account = "ABCDEF1234567890";
    private static DecodingOrchestrator Decoder() => new(new("10.0.0.1", 7777));
    private static BitReader Identity(string account = Account) => new WireFixture().Bits(0, 1).Packed(44).Identity(account).Packed(0).Reader();
    private static PacketEnvelope Property(long ordinal, BitReader block, int channel = 9, string direction = "fromServer") =>
        RecoveryPackets.Packet(ordinal, RecoveryPackets.Block(block, true), channel, direction: direction);
    private static BitReader Reverse(uint pawn) => new WireFixture().Bits(0, 1).Packed(64).Packed(pawn).Packed(0).Reader();
    private static BitReader Ping() => new WireFixture().Bits(0, 1).Packed(18).Bits(7, 8).Packed(95).Bits(BitConverter.SingleToUInt32Bits(2.5f), 32).Packed(0).Reader();
    private static void Pawn(DecodingOrchestrator decoder, uint state = 200)
    {
        decoder.Accept(RecoveryPackets.Export(1, 37, 0, "/Game/Characters/Classes/Subclasses/Default__Footman"));
        decoder.Accept(RecoveryPackets.Open(2, 100, 37));
        decoder.Accept(RecoveryPackets.Movement(3, playerState: state));
    }

    [Fact] public void TypedCompleteProfileAdmitsGuidlessAccountAndLaterFieldsOnlyInItsChannel()
    {
        var decoder = Decoder();
        var proof = Assert.Single(decoder.Accept(Property(1, Identity())), row => row.Kind == "properties");
        Assert.Equal("playerState", proof.Detail);
        Assert.Equal(0u, proof.ActorGuid);
        Assert.Equal(Account, Assert.IsType<UniqueNetId>(proof.Fields!["playFabIdentity"]).Id);
        Assert.Equal(1, proof.Evidence!.CompletionOrdinal);
        var update = Assert.Single(decoder.Accept(Property(2, Ping())), row => row.Kind == "properties");
        Assert.Equal(7ul, update.Fields!["ping"]);
        Assert.Equal(2.5f, update.Fields["profileFloat95"]);
        Assert.False(update.Fields.ContainsKey("playFabIdentity"));
        Assert.Equal(2, update.Evidence!.CompletionOrdinal);
        Assert.DoesNotContain(decoder.Accept(Property(3, Ping(), channel: 10)), row => row.Detail == "playerState");
    }

    [Fact] public void ProofDoesNotPromoteOtherActorsSharingItsUnresolvedArchetype()
    {
        var decoder = Decoder();
        decoder.Accept(RecoveryPackets.Open(1, 200, 93, 9));
        decoder.Accept(RecoveryPackets.Open(2, 202, 93, 10));
        Assert.Contains(decoder.Accept(Property(3, Identity())), row => row.Detail == "playerState");
        Assert.DoesNotContain(decoder.Accept(Property(4, Ping(), 10)), row => row.Detail == "playerState");
    }

    [Fact] public void ReverseReferenceResolvesOnlyAfterCurrentExplicitPawnStateProof()
    {
        var decoder = Decoder();
        Pawn(decoder);
        decoder.Accept(Property(4, Identity()));
        var rows = decoder.Accept(Property(5, Reverse(100)));
        var resolved = Assert.Single(rows, row => row.Kind == "actorResolved");
        Assert.Equal(200u, resolved.ActorGuid);
        Assert.Equal("playerState", resolved.Detail);
        var identity = Assert.Single(rows, row => row.Fields?.ContainsKey("playFabIdentity") == true);
        Assert.Equal(200u, identity.ActorGuid);
        Assert.Equal("retainedPlayerStateIdentity", identity.Evidence!.Coverage);
        Assert.Equal(4, identity.Evidence.CompletionOrdinal);
        Assert.True(rows.ToList().IndexOf(resolved) < rows.ToList().IndexOf(identity));
        Assert.DoesNotContain(decoder.Accept(Property(6, Ping())), row => row.Fields?.ContainsKey("playFabIdentity") == true);
    }

    [Fact] public void ExplicitClearAndClosedPawnCannotSupplyReverseProof()
    {
        foreach (var close in new[] { false, true })
        {
            var decoder = Decoder();
            Pawn(decoder);
            decoder.Accept(Property(4, Identity()));
            decoder.Accept(close ? RecoveryPackets.Packet(5, new([]), close: true) : RecoveryPackets.Movement(5, playerState: 0));
            Assert.DoesNotContain(decoder.Accept(Property(6, Reverse(100))), row => row.ActorGuid != 0 && row.Detail == "playerState");
        }
    }

    [Fact] public void ConflictingReverseStateQuarantinesTheProfileLifetime()
    {
        var decoder = Decoder();
        Pawn(decoder);
        decoder.Accept(Property(4, Identity()));
        decoder.Accept(Property(5, Reverse(100)));
        decoder.Accept(RecoveryPackets.Movement(6, playerState: 300));
        Assert.Contains(decoder.Accept(Property(7, Reverse(100))), row => row.Kind == "actorClosed" && row.ActorGuid == 200);
        Assert.DoesNotContain(decoder.Accept(Property(8, Ping())), row => row.Kind == "properties");
    }

    [Theory]
    [InlineData("close")]
    [InlineData("open")]
    [InlineData("emptyOpen")]
    [InlineData("malformedOpen")]
    [InlineData("gap")]
    public void ResetRequiresANewTypedProfile(string reset)
    {
        var decoder = Decoder();
        decoder.Accept(Property(1, Identity()));
        if (reset == "close") decoder.Accept(RecoveryPackets.Packet(2, new([]), channel: 9, close: true));
        if (reset == "open") decoder.Accept(RecoveryPackets.Open(2, 202, 93, 9));
        if (reset == "emptyOpen") Assert.Contains(decoder.Accept(RecoveryPackets.Packet(2, new([]), channel: 9, open: true)), row => row.Kind == "actorClosed");
        if (reset == "malformedOpen") Assert.Contains(decoder.Accept(RecoveryPackets.Packet(2, new WireFixture().Bits(0, 1).Reader(), channel: 9, open: true)), row => row.Kind == "actorClosed");
        if (reset == "gap") decoder.Accept(Property(2, Ping()) with { LossCount = 1 });
        Assert.DoesNotContain(decoder.Accept(Property(3, Ping())), row => row.Detail == "playerState");
        Assert.Contains(decoder.Accept(Property(4, Identity())), row => row.Detail == "playerState");
    }

    [Fact] public void ConflictingTypedIdentityClosesAndQuarantinesUntilReopen()
    {
        var decoder = Decoder();
        decoder.Accept(Property(1, Identity()));
        Assert.Contains(decoder.Accept(Property(2, Identity("FEDCBA0987654321"))), row => row.Kind == "actorClosed");
        Assert.DoesNotContain(decoder.Accept(Property(3, Identity())), row => row.Kind == "properties");
        decoder.Accept(RecoveryPackets.Open(4, 202, 93, 9));
        Assert.Contains(decoder.Accept(Property(5, Identity("FEDCBA0987654321"))), row => row.Kind == "properties");
    }

    [Fact] public void PartialTrailingOutgoingAndKnownNonPlayerProfilesAreRejected()
    {
        var decoder = Decoder();
        var valid = Identity();
        Assert.DoesNotContain(decoder.Accept(Property(1, new(valid.Data, valid.SizeBits - 1))), row => row.Detail == "playerState");
        var trailing = new RecoveryBits().Append(valid).Bits(0, 1).Reader();
        Assert.DoesNotContain(decoder.Accept(Property(2, trailing)), row => row.Detail == "playerState");
        Assert.DoesNotContain(decoder.Accept(Property(3, valid, direction: "toServer")), row => row.Detail == "playerState");
        decoder.Accept(RecoveryPackets.Export(4, 37, 0, "/Script/Engine.Actor"));
        decoder.Accept(RecoveryPackets.Open(5, 200, 37, 9));
        Assert.DoesNotContain(decoder.Accept(Property(6, valid)), row => row.Detail == "playerState");
    }

    [Fact] public void SameBlockTypedProofAndReverseReferenceEmitIdentityOnce()
    {
        var decoder = Decoder();
        Pawn(decoder);
        var block = new WireFixture().Bits(0, 1).Packed(44).Identity(Account).Packed(64).Packed(100).Packed(0).Reader();
        var rows = decoder.Accept(Property(4, block));
        Assert.Single(rows, row => row.Fields?.ContainsKey("playFabIdentity") == true);
        Assert.Contains(rows, row => row.Kind == "actorResolved" && row.ActorGuid == 200);
    }

    [Fact] public void InvalidLaterProfileDoesNotLeakPrefixFields()
    {
        var decoder = Decoder();
        decoder.Accept(Property(1, Identity()));
        var trailing = new RecoveryBits().Append(Ping()).Bits(1, 1).Reader();
        Assert.DoesNotContain(decoder.Accept(Property(2, trailing)), row => row.Kind == "properties");
        var recovery = new ColdIdentityRecovery();
        var channels = new ChannelTracker();
        var state = channels.Get("fromServer", 9);
        var source = new ObservationSource("fromServer", 9, 0, 0, null, 0, 0, 0, 1, "typedPlayerStateProfile");
        recovery.Observe(9, state, Identity(), channels, source, []);
        var oversized = new BitReader(new byte[4097]);
        var rows = new List<DecodedRecord>();
        Assert.True(recovery.Observe(9, state, oversized, channels, source, rows));
        Assert.DoesNotContain(rows, row => row.Kind == "properties");
    }

    [Fact] public void LateNamedClassContradictionQuarantinesTypedProfile()
    {
        var decoder = Decoder();
        decoder.Accept(RecoveryPackets.Open(1, 200, 93, 9));
        decoder.Accept(Property(2, Identity()));
        Assert.Contains(decoder.Accept(RecoveryPackets.Export(3, 93, 0, "/Script/Engine.Actor")), row => row.Kind == "actorClosed");
        Assert.DoesNotContain(decoder.Accept(Property(4, Ping())), row => row.Kind == "properties");
    }

    [Fact] public void UnsupportedProfileRetainsIdentityOnlyAfterADirectPawnReference()
    {
        var decoder = Decoder();
        decoder.Accept(RecoveryPackets.Open(1, 200, 93, 9));
        var unsupported = new WireFixture().Bits(0, 1).Packed(30).Bits(0, 8).Packed(44).Identity(Account).Packed(0).Reader();
        Assert.DoesNotContain(decoder.Accept(Property(2, unsupported)), row => row.Kind == "properties");
        Assert.DoesNotContain(decoder.Accept(Property(3, Ping())), row => row.Kind == "properties");
        decoder.Accept(RecoveryPackets.Movement(4));
        decoder.Accept(RecoveryPackets.Movement(5));
        var rows = decoder.Accept(RecoveryPackets.Movement(6, playerState: 200));
        var identity = Assert.Single(rows, row => row.Fields?.ContainsKey("playFabIdentity") == true);
        Assert.Equal(200u, identity.ActorGuid);
        Assert.Single(identity.Fields!);
        Assert.True(rows.ToList().IndexOf(identity) < rows.ToList().FindIndex(row => row.Kind == "position"));
        Assert.DoesNotContain(decoder.Accept(Property(7, Ping())), row => row.Detail == "playerState");
        decoder.Accept(RecoveryPackets.Packet(8, new([]), channel: 9, close: true));
        Assert.DoesNotContain(decoder.Accept(RecoveryPackets.Movement(9, playerState: 200)), row => row.Fields?.ContainsKey("playFabIdentity") == true);
    }

    [Fact] public void LaterComponentOuterCannotReplaceReverseProvedActor()
    {
        var decoder = Decoder();
        Pawn(decoder);
        decoder.Accept(Property(4, Identity()));
        decoder.Accept(Property(5, Reverse(100)));
        decoder.Accept(RecoveryPackets.Export(6, 302, 300, "ProfileComponent"));
        var subobject = new RecoveryBits().Bits(0, 1).Bits(0, 1).Packed(302).Bits(1, 1).Packed(0).Reader();
        Assert.Contains(decoder.Accept(RecoveryPackets.Packet(7, subobject, channel: 9)), row => row.Kind == "actorClosed" && row.ActorGuid == 200);
        Assert.DoesNotContain(decoder.Accept(Property(8, Ping())), row => row.Kind == "properties");
    }

    [Fact] public void CompleteProfileCannotOverrideConflictingBoundedIdentity()
    {
        var decoder = Decoder();
        decoder.Accept(RecoveryPackets.Open(1, 200, 93, 9));
        var unsupported = new WireFixture().Bits(0, 1).Packed(30).Bits(0, 8).Packed(44).Identity(Account).Packed(0).Reader();
        decoder.Accept(Property(2, unsupported));
        var rows = decoder.Accept(Property(3, Identity("FEDCBA0987654321")));
        Assert.Contains(rows, row => row.Kind == "actorClosed");
        Assert.DoesNotContain(rows, row => row.Kind == "properties");
    }

    [Fact] public void LaterComponentOuterReemitsRetainedIdentityAfterResolvingTheSameChannel()
    {
        var decoder = Decoder();
        decoder.Accept(Property(1, Identity()));
        decoder.Accept(RecoveryPackets.Export(2, 202, 200, "ProfileComponent"));
        var subobject = new RecoveryBits().Bits(0, 1).Bits(0, 1).Packed(202).Bits(1, 1).Packed(0).Reader();
        var rows = decoder.Accept(RecoveryPackets.Packet(3, subobject, channel: 9));
        var resolved = Assert.Single(rows, row => row.Kind == "actorResolved" && row.ActorGuid == 200);
        var proof = Assert.Single(rows, row => row.Fields?.ContainsKey("playFabIdentity") == true);
        Assert.Equal(200u, proof.ActorGuid);
        Assert.Equal("retainedPlayerStateIdentity", proof.Evidence!.Coverage);
        Assert.True(rows.ToList().IndexOf(resolved) < rows.ToList().IndexOf(proof));
    }

    [Fact] public void RetainedNameKeepsItsOwnObservedBody()
    {
        var decoder = Decoder();
        Pawn(decoder);
        decoder.Accept(Property(4, Identity()));
        decoder.Accept(Property(5, new WireFixture().Bits(0, 1).Packed(26).Text("Observed name").Packed(0).Reader()));
        var rows = decoder.Accept(Property(6, Reverse(100)));
        var name = Assert.Single(rows, row => row.Fields?.ContainsKey("playerName") == true);
        Assert.Equal(5, name.Evidence!.CompletionOrdinal);
        Assert.Equal("Observed name", name.Fields!["playerName"]);
        Assert.Equal(4, Assert.Single(rows, row => row.Fields?.ContainsKey("playFabIdentity") == true).Evidence!.CompletionOrdinal);
    }
}
