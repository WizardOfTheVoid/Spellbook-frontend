namespace SpellBook.Telemetry;

public class SpawnReaderTests
{
    [Fact] public void OmittedLocationIsUnknownRatherThanWorldOrigin()
    {
        var reader = new WireFixture().Packed(200).Packed(37).Packed(39).Bits(0, 4).Reader();
        var spawn = SpawnReader.Read(reader, new(), false);
        Assert.Null(spawn.Location);
        Assert.False(spawn.LocationPresent);
        Assert.Equal(0, reader.Remaining);
    }

    [Fact] public void ExplicitWorldOriginIsDifferentFromOmittedLocation()
    {
        var reader = new WireFixture().Packed(200).Packed(37).Packed(39)
            .Bits(1, 1).Bits(0, 1).Bits(0, 32).Bits(0, 32).Bits(0, 32).Bits(0, 3).Reader();
        var spawn = SpawnReader.Read(reader, new(), false);
        Assert.True(spawn.LocationPresent);
        Assert.Equal(new Vec3(), spawn.Location);
        Assert.Equal(0, reader.Remaining);
    }

    [Fact] public void RejectsNonfiniteSpawnCoordinates()
    {
        var reader = new WireFixture().Packed(200).Packed(37).Packed(39)
            .Bits(1, 1).Bits(0, 1).Bits(0x7fc00000, 32).Bits(0, 32).Bits(0, 32).Bits(0, 3).Reader();
        Assert.Throws<InvalidDataException>(() => SpawnReader.Read(reader, new(), false));
    }
}
