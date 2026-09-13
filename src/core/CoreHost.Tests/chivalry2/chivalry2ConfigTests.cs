using System.Text;
using CoreHost.Chivalry2;

namespace CoreHost.Tests.Chivalry2;

public sealed class Chivalry2ConfigTests
{
    private const string consoleSection = "/Script/TBL.TBLGameUserSettings";

    [Fact]
    public async Task readPreservesSectionsAndRepeatedStringValues()
    {
        using var files = new ConfigFiles();
        await files.write("Game.ini", "; comment\r\nRoot=001\r\n[First]\r\nFlag=True\r\n+Items=(Name=\"One\")\r\n+Items=(Name=\"Two\")\r\n[Second]\r\nFlag=False\r\n");

        var result = await files.config.read("game", TestContext.Current.CancellationToken);

        Assert.Equal("Game.ini", result.File);
        Assert.Equal(["001"], result.Sections[""]["Root"]);
        Assert.Equal(["True"], result.Sections["First"]["Flag"]);
        Assert.Equal(["(Name=\"One\")", "(Name=\"Two\")"], result.Sections["First"]["+Items"]);
        Assert.Equal(["False"], result.Sections["Second"]["Flag"]);
    }

    [Theory]
    [InlineData("utf8")]
    [InlineData("utf8-bom")]
    [InlineData("utf16-le")]
    [InlineData("utf16-be")]
    [InlineData("utf16-le-no-bom")]
    [InlineData("utf16-be-no-bom")]
    [InlineData("utf32-le")]
    [InlineData("utf32-be")]
    [InlineData("utf32-le-no-bom")]
    [InlineData("utf32-be-no-bom")]
    [InlineData("windows1252")]
    public async Task setPreservesEncodingAndUntouchedBytes(string encodingName)
    {
        using var files = new ConfigFiles();
        var encoding = ConfigFiles.encoding(encodingName);
        const string original = "; café\r\n[Other]\r\nbConsoleEnabled=False\r\n[/Script/TBL.TBLGameUserSettings]\n  bConsoleEnabled = False  ; keep comment\r\nName=Magic\r\n# final";
        await files.write("GameUserSettings.ini", original, encoding);

        var result = await files.config.set("gameusersettings", "bConsoleEnabled", "True", cancellationToken: TestContext.Current.CancellationToken);

        Assert.True(result.Updated);
        Assert.Equal(consoleSection, result.Section);
        Assert.Equal(ConfigFiles.bytes(original.Replace(" = False  ;", " = True  ;"), encoding), await File.ReadAllBytesAsync(files.path("GameUserSettings.ini"), TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData("[/Script/TBL.TBLGameUserSettings]\r\nName=Magic\r\n[Other]\r\nx=1\r\n", "[/Script/TBL.TBLGameUserSettings]\r\nName=Magic\r\nbConsoleEnabled=True\r\n[Other]\r\nx=1\r\n")]
    [InlineData("[Other]\nx=1", "[Other]\nx=1\n[/Script/TBL.TBLGameUserSettings]\nbConsoleEnabled=True")]
    [InlineData("", "[/Script/TBL.TBLGameUserSettings]\nbConsoleEnabled=True")]
    public async Task setInsertsKnownConsoleSettingIntoItsSection(string original, string expected)
    {
        using var files = new ConfigFiles();
        await files.write("GameUserSettings.ini", original);

        await files.config.set("gameusersettings", "bConsoleEnabled", "True", cancellationToken: TestContext.Current.CancellationToken);

        Assert.Equal(expected, await File.ReadAllTextAsync(files.path("GameUserSettings.ini"), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task setResolvesUniqueGenericKeyAndExplicitNewSection()
    {
        using var files = new ConfigFiles();
        await files.write("Game.ini", "[First]\nUnique=001\n[Second]\nOther=2\n");

        await files.config.set("game", "Unique", "002", cancellationToken: TestContext.Current.CancellationToken);
        await files.config.set("game", "New", "(Value=\"A=B; C\")", "Third", TestContext.Current.CancellationToken);

        Assert.Equal("[First]\nUnique=002\n[Second]\nOther=2\n[Third]\nNew=(Value=\"A=B; C\")\n", await File.ReadAllTextAsync(files.path("Game.ini"), TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData("[First]\nKey=1\n[Second]\nKey=2\n", null, "INI_KEY_AMBIGUOUS")]
    [InlineData("[First]\nKey=1\nKey=2\n", "First", "INI_KEY_AMBIGUOUS")]
    [InlineData("[First]\nOther=1\n", null, "INI_SECTION_REQUIRED")]
    public async Task setRejectsAmbiguousOrUnlocatedKeysWithoutWriting(string original, string? section, string errorCode)
    {
        using var files = new ConfigFiles();
        await files.write("Game.ini", original);

        var error = await Assert.ThrowsAsync<Chivalry2ConfigException>(() => files.config.set("game", "Key", "3", section, TestContext.Current.CancellationToken));

        Assert.Equal(errorCode, error.Code);
        Assert.Equal(original, await File.ReadAllTextAsync(files.path("Game.ini"), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task setUsesExplicitSectionForKeySharedAcrossSections()
    {
        using var files = new ConfigFiles();
        await files.write("Game.ini", "[First]\nKey=1\n[Second]\nKey=2\n");

        await files.config.set("game", "Key", "3", "Second", TestContext.Current.CancellationToken);

        Assert.Equal("[First]\nKey=1\n[Second]\nKey=3\n", await File.ReadAllTextAsync(files.path("Game.ini"), TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData("Key\nOther", "value", "First")]
    [InlineData("Key=Other", "value", "First")]
    [InlineData(";Key", "value", "First")]
    [InlineData("Key", "value\r\nOther=1", "First")]
    [InlineData("Key", "value\0Other", "First")]
    [InlineData("Key", "value\vOther", "First")]
    [InlineData("Key\u2028Other", "value", "First")]
    [InlineData("Key", "value", "First\u2029Other")]
    [InlineData("Key", "value", "First]\n[Second")]
    public async Task setRejectsMalformedLineInput(string key, string value, string section)
    {
        using var files = new ConfigFiles();
        const string original = "[First]\nKey=old\n";
        await files.write("Game.ini", original);

        var error = await Assert.ThrowsAsync<Chivalry2ConfigException>(() => files.config.set("game", key, value, section, TestContext.Current.CancellationToken));

        Assert.Equal("INVALID_REQUEST", error.Code);
        Assert.Equal(original, await File.ReadAllTextAsync(files.path("Game.ini"), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task identicalUpdateDoesNotReplaceFile()
    {
        using var files = new ConfigFiles();
        await files.write("Game.ini", "[First]\nKey=True\n");
        var oldTime = new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(files.path("Game.ini"), oldTime);

        var result = await files.config.set("game", "Key", "True", cancellationToken: TestContext.Current.CancellationToken);

        Assert.False(result.Updated);
        Assert.Equal(oldTime, File.GetLastWriteTimeUtc(files.path("Game.ini")));
    }

    [Fact]
    public async Task simultaneousUpdatesToOneFilePreserveBothChanges()
    {
        using var files = new ConfigFiles();
        await files.write("Game.ini", "[First]\nOne=old\nTwo=old\n");

        await Task.WhenAll(files.config.set("game", "One", "new-one", cancellationToken: TestContext.Current.CancellationToken), files.config.set("game", "Two", "new-two", cancellationToken: TestContext.Current.CancellationToken));

        Assert.Equal("[First]\nOne=new-one\nTwo=new-two\n", await File.ReadAllTextAsync(files.path("Game.ini"), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task staleReplacementPreservesExternalChanges()
    {
        using var files = new ConfigFiles();
        var original = Encoding.UTF8.GetBytes("[First]\nKey=old\n");
        await files.write("Game.ini", "[First]\nKey=external\n");

        var error = await Assert.ThrowsAsync<Chivalry2ConfigException>(() => IniFileStore.replace(files.path("Game.ini"), original, Encoding.UTF8.GetBytes("[First]\nKey=ours\n"), TestContext.Current.CancellationToken));

        Assert.Equal("INI_FILE_CHANGED", error.Code);
        Assert.Equal("[First]\nKey=external\n", await File.ReadAllTextAsync(files.path("Game.ini"), TestContext.Current.CancellationToken));
        Assert.Single(Directory.GetFiles(files.directory));
    }

    [Fact]
    public async Task failedReplacementPreservesOriginalAndRemovesTemporaryFile()
    {
        using var files = new ConfigFiles();
        const string original = "[First]\nKey=old\n";
        await files.write("Game.ini", original);
        using var lockedFile = new FileStream(files.path("Game.ini"), FileMode.Open, FileAccess.Read, FileShare.ReadWrite);

        var error = await Assert.ThrowsAsync<Chivalry2ConfigException>(() => files.config.set("game", "Key", "new", cancellationToken: TestContext.Current.CancellationToken));

        Assert.Equal("INI_WRITE_FAILED", error.Code);
        Assert.Equal(original, await File.ReadAllTextAsync(files.path("Game.ini"), TestContext.Current.CancellationToken));
        Assert.Single(Directory.GetFiles(files.directory));
    }

    [Fact]
    public async Task missingFilesAreReportedWithoutCreatingConfiguration()
    {
        using var files = new ConfigFiles();

        var readError = await Assert.ThrowsAsync<Chivalry2ConfigException>(() => files.config.read("game", TestContext.Current.CancellationToken));
        var writeError = await Assert.ThrowsAsync<Chivalry2ConfigException>(() => files.config.set("game", "Key", "value", "First", TestContext.Current.CancellationToken));

        Assert.Equal("INI_FILE_NOT_FOUND", readError.Code);
        Assert.Equal("INI_FILE_NOT_FOUND", writeError.Code);
        Assert.Empty(Directory.GetFiles(files.directory));
    }

    [Theory]
    [InlineData("../Game.ini")]
    [InlineData("C:\\Windows\\win.ini")]
    [InlineData("engine")]
    public async Task readRejectsAnythingOtherThanNamedFiles(string file)
    {
        using var files = new ConfigFiles();

        var error = await Assert.ThrowsAsync<Chivalry2ConfigException>(() => files.config.read(file, TestContext.Current.CancellationToken));

        Assert.Equal("INVALID_REQUEST", error.Code);
    }
}

internal sealed class ConfigFiles : IDisposable
{
    internal readonly string directory = Path.Combine(Path.GetTempPath(), "spellbook-ini-tests", Guid.NewGuid().ToString("N"));
    internal Chivalry2Config config { get; }

    internal ConfigFiles()
    {
        Directory.CreateDirectory(directory);
        config = new Chivalry2Config(directory);
    }

    internal string path(string file) => Path.Combine(directory, file);

    internal Task write(string file, string text, Encoding? encoding = null) => File.WriteAllBytesAsync(path(file), bytes(text, encoding ?? new UTF8Encoding(false)), TestContext.Current.CancellationToken);

    internal static byte[] bytes(string text, Encoding encoding) => [.. encoding.GetPreamble(), .. encoding.GetBytes(text)];

    internal static Encoding encoding(string name)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        return name switch
        {
            "utf8-bom" => new UTF8Encoding(true),
            "utf16-le" => new UnicodeEncoding(false, true),
            "utf16-be" => new UnicodeEncoding(true, true),
            "utf16-le-no-bom" => new UnicodeEncoding(false, false),
            "utf16-be-no-bom" => new UnicodeEncoding(true, false),
            "utf32-le" => new UTF32Encoding(false, true),
            "utf32-be" => new UTF32Encoding(true, true),
            "utf32-le-no-bom" => new UTF32Encoding(false, false),
            "utf32-be-no-bom" => new UTF32Encoding(true, false),
            "windows1252" => Encoding.GetEncoding(1252),
            _ => new UTF8Encoding(false)
        };
    }

    public void Dispose() => Directory.Delete(directory, recursive: true);
}
