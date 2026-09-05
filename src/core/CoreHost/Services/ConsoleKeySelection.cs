using System.Text.Json;

namespace CoreHost.Services;

public sealed class ConsoleKeySelection(IHttpContextAccessor contextAccessor)
{
    public const string HeaderName = "X-SpellBook-Console-Key";
    private static readonly IReadOnlyDictionary<string, ConsoleKey> Keys = LoadKeys();

    public string? Code => contextAccessor.HttpContext?.Request.Headers[HeaderName].FirstOrDefault();

    public static bool TryGetKey(string code, out ConsoleKey? key) => Keys.TryGetValue(code, out key);

    private static IReadOnlyDictionary<string, ConsoleKey> LoadKeys()
    {
        using var stream = typeof(ConsoleKeySelection).Assembly.GetManifestResourceStream("consoleKeys.json")
            ?? throw new InvalidOperationException("Console key definitions are missing.");
        return JsonSerializer.Deserialize<Dictionary<string, ConsoleKey>>(stream, new JsonSerializerOptions(JsonSerializerDefaults.Web))
            ?? throw new InvalidOperationException("Console key definitions are invalid.");
    }
}

public sealed record ConsoleKey(ushort ScanCode, bool Extended);
