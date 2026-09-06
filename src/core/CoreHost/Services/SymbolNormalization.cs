using System.Text.Json;
using System.Text.RegularExpressions;
using CoreHost.Models;

namespace CoreHost.Services;

public sealed class SymbolNormalization
{
    private readonly IReadOnlyDictionary<string, string> _replacements;
    private readonly Regex? _matcher;

    public SymbolNormalization()
        : this(Path.Combine(AppContext.BaseDirectory, "symbolNormalization.json"))
    {
    }

    internal SymbolNormalization(string path)
        : this(Load(path))
    {
    }

    internal SymbolNormalization(IReadOnlyDictionary<string, string> replacements)
    {
        var validated = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (key, value) in replacements)
        {
            if (string.IsNullOrEmpty(key) || string.IsNullOrEmpty(value) ||
                RequestValidators.ContainsForbiddenLineCharacter(key) ||
                RequestValidators.ContainsForbiddenLineCharacter(value))
            {
                throw new InvalidOperationException(
                    "Invalid symbolNormalization.json: keys and values must be non-empty single-line strings.");
            }

            validated.Add(key, value);
        }

        _replacements = validated;
        var pattern = string.Join("|", validated.Keys
            .OrderByDescending(key => key.Length)
            .Select(Regex.Escape));
        _matcher = pattern.Length == 0
            ? null
            : new Regex(pattern, RegexOptions.Compiled | RegexOptions.CultureInvariant);
    }

    public string Apply(string value)
    {
        return _matcher?.Replace(value, match => _replacements[match.Value]) ?? value;
    }

    private static IReadOnlyDictionary<string, string> Load(string path)
    {
        try
        {
            var mapping = JsonSerializer.Deserialize<Dictionary<string, string>>(
                File.ReadAllText(path));
            return mapping ?? throw new JsonException("Expected a JSON object.");
        }
        catch (Exception error) when (
            error is IOException or UnauthorizedAccessException or JsonException)
        {
            throw new InvalidOperationException(
                $"Invalid symbolNormalization.json at {path}: {error.Message}",
                error);
        }
    }
}
