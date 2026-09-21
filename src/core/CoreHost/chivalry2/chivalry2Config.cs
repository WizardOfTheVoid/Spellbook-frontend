namespace CoreHost.Chivalry2;

public sealed record Chivalry2ConfigData(string File, Dictionary<string, Dictionary<string, string[]>> Sections);
public sealed record Chivalry2ConfigUpdate(string File, string Section, string Key, string Value, bool Updated);

public sealed class Chivalry2ConfigException(string code, string message, int statusCode = 400) : Exception(message)
{
    public string Code { get; } = code;
    public int StatusCode { get; } = statusCode;
}

public sealed class Chivalry2Config
{
    private readonly string directory;
    private readonly Dictionary<string, SemaphoreSlim> fileLocks = new(StringComparer.OrdinalIgnoreCase)
    {
        ["GameUserSettings.ini"] = new(1, 1),
        ["Game.ini"] = new(1, 1)
    };

    public Chivalry2Config(string? directory = null)
    {
        this.directory = directory ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Chivalry 2", "Saved", "Config", "WindowsNoEditor");
    }

    public async Task<Chivalry2ConfigData> read(string file, CancellationToken cancellationToken = default)
    {
        var name = fileName(file);
        var bytes = await IniFileStore.read(Path.Combine(directory, name), cancellationToken);
        return new(name, IniDocument.parse(bytes).sections());
    }

    public async Task<Chivalry2ConfigUpdate> set(string file, string key, string value, string? section = null, CancellationToken cancellationToken = default)
    {
        var name = fileName(file);
        IniDocument.validate(key, value, section);
        if (section is null && name == "GameUserSettings.ini" && key.Equals("bConsoleEnabled", StringComparison.OrdinalIgnoreCase))
        {
            section = "/Script/TBL.TBLGameUserSettings";
        }

        var fileLock = fileLocks[name];
        await fileLock.WaitAsync(cancellationToken);
        try
        {
            var path = Path.Combine(directory, name);
            var original = await IniFileStore.read(path, cancellationToken);
            var document = IniDocument.parse(original);
            var targetSection = document.set(key, value, section);
            var updated = document.bytes();
            var changed = !original.AsSpan().SequenceEqual(updated);
            if (changed) await IniFileStore.replace(path, original, updated, cancellationToken);
            return new(name, targetSection, key, value, changed);
        }
        finally
        {
            fileLock.Release();
        }
    }

    private static string fileName(string file) => file.ToLowerInvariant() switch
    {
        "gameusersettings" or "gameusersettings.ini" => "GameUserSettings.ini",
        "game" or "game.ini" => "Game.ini",
        _ => throw new Chivalry2ConfigException("INVALID_REQUEST", "File must be gameusersettings or game.")
    };
}
