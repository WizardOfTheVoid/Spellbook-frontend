using System.Text.RegularExpressions;

namespace CoreHost.Services;

public sealed class ListPlayersTextNormalizer
{
    private static readonly Regex WhitespaceRegex = new("\\s+", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex OneVOneRegex = new("1v1", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    public string NormalizeServerName(string value)
    {
        var withoutOneVOne = OneVOneRegex.Replace(value, string.Empty);
        return WhitespaceRegex.Replace(withoutOneVOne, string.Empty).Trim();
    }
}
