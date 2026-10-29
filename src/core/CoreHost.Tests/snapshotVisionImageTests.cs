using System.Drawing;
using CoreHost.Snapshot;

namespace CoreHost.Tests;

public class SnapshotVisionImageTests
{
    [Theory]
    [InlineData(2700, 420, 1568, 280)]
    [InlineData(100, 20, 280, 280)]
    [InlineData(800, 600, 800, 600)]
    [InlineData(420, 2700, 280, 1568)]
    public void FitsImageLimitsWithoutStretchingTheCrop(int width, int height, int expectedWidth, int expectedHeight)
    {
        using var source = new Bitmap(width, height);
        using (var graphics = Graphics.FromImage(source)) graphics.Clear(Color.White);
        using var prepared = SnapshotVisionImage.Prepare(source);
        Assert.Equal(expectedWidth, prepared.Width);
        Assert.Equal(expectedHeight, prepared.Height);
        Assert.Equal(Color.White.ToArgb(), prepared.GetPixel(prepared.Width / 2, prepared.Height / 2).ToArgb());
        if (width < 280 || height < 280 || width > 1568 || height > 1568)
            Assert.Equal(Color.Black.ToArgb(), prepared.GetPixel(0, 0).ToArgb());
    }
}
