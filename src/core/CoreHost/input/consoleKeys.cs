using System.Text.Json;

namespace CoreHost.Input;

public static class ConsoleKeys
{
    private static readonly IReadOnlyDictionary<string, ConsoleKey> keys = load();
    public static bool contains(string? code) => code is not null && keys.ContainsKey(code);
    public static ConsoleKey get(string code) => keys[code];
    private static IReadOnlyDictionary<string, ConsoleKey> load()
    {
        using var stream = typeof(ConsoleKeys).Assembly.GetManifestResourceStream("consoleKeys.json")
            ?? throw new InvalidOperationException("Console key definitions are missing.");
        return JsonSerializer.Deserialize<Dictionary<string, ConsoleKey>>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    }
}
public sealed record ConsoleKey(ushort ScanCode, bool Extended);
