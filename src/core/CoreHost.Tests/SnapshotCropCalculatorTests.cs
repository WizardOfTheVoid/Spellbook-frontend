using CoreHost.Options;
using CoreHost.Snapshot;

namespace CoreHost.Tests;

public class SnapshotCropCalculatorTests
{
    [Fact]
    public void FramesTheSameAreaAcrossResolutions()
    {
        var options = new SnapshotOptions();

        var hd = SnapshotCropCalculator.Resolve(options, 1920, 1080);
        var uhd = SnapshotCropCalculator.Resolve(options, 3840, 2160);

        // Integer rounding can drift a pixel or two between resolutions; framing still matches.
        AssertClose(hd.X * 2, uhd.X);
        AssertClose(hd.Y * 2, uhd.Y);
        AssertClose(hd.Width * 2, uhd.Width);
        AssertClose(hd.Height * 2, uhd.Height);
    }

    private static void AssertClose(int expected, int actual)
    {
        Assert.True(Math.Abs(expected - actual) <= 2, $"Expected ~{expected} but got {actual}.");
    }

    [Theory]
    [InlineData("TopLeft", 0, 0)]
    [InlineData("BottomRight", 1000, 800)]
    [InlineData("Center", 500, 400)]
    [InlineData("nonsense", 500, 400)]
    public void PlacesTheCropAtTheRequestedAnchor(string anchor, int expectedX, int expectedY)
    {
        var options = new SnapshotOptions
        {
            CropAnchor = anchor,
            CropWidthPercent = 50,
            CropHeightPercent = 20
        };

        var crop = SnapshotCropCalculator.Resolve(options, 2000, 1000);

        Assert.Equal(expectedX, crop.X);
        Assert.Equal(expectedY, crop.Y);
    }

    [Fact]
    public void ClampsOffsetsInsideTheWindow()
    {
        var options = new SnapshotOptions { CropAnchor = "BottomCenter", CropOffsetYPercent = 40 };

        var crop = SnapshotCropCalculator.Resolve(options, 1920, 1080);

        Assert.Equal(1080 - crop.Height, crop.Y);
    }
}
