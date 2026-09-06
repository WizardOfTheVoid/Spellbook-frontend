using System.Text;
using System.Text.RegularExpressions;
using AnyAscii;
using CoreHost.Models;

namespace CoreHost.Services;

public sealed class CoreTextSanitizer(SymbolNormalization symbolNormalization)
{
    private static readonly Regex WhitespaceRegex = new("\\s+", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex OutboundMessageCharacterRegex = new("[^ -~]", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public bool TryNormalizeOutboundMessage(string? text, string fieldName, out string normalized, out string? errorMessage)
    {
        return TrySanitizeOutboundMessage(text, fieldName, false, out normalized, out errorMessage);
    }

    public bool TryNormalizeGeneralMessage(string? text, string fieldName, out string normalized, out string? errorMessage)
    {
        return TrySanitizeOutboundMessage(text, fieldName, true, out normalized, out errorMessage);
    }

    private bool TrySanitizeOutboundMessage(
        string? text,
        string fieldName,
        bool preserveUnicode,
        out string normalized,
        out string? errorMessage)
    {
        normalized = string.Empty;
        var original = text ?? string.Empty;
        if (RequestValidators.ContainsForbiddenLineCharacter(original))
        {
            errorMessage = $"{fieldName} cannot contain CR, LF, or NUL.";
            return false;
        }

        normalized = SanitizeOutboundText(original, RequestValidators.MaxQuotedTextLength, preserveUnicode);
        if (normalized.Length == 0)
        {
            errorMessage = preserveUnicode
                ? $"{fieldName} must contain text after sanitization."
                : $"{fieldName} must contain supported ASCII text after sanitization.";
            return false;
        }

        errorMessage = null;
        return true;
    }

    private string SanitizeOutboundText(string value, int maxLength, bool preserveUnicode)
    {
        var normalized = symbolNormalization.Apply(value);
        if (!preserveUnicode)
        {
            normalized = normalized.Normalize(NormalizationForm.FormKC).Transliterate();
        }

        normalized = WhitespaceRegex.Replace(normalized, " ");
        normalized = normalized.Replace('"', '\'');
        if (!preserveUnicode)
        {
            normalized = OutboundMessageCharacterRegex.Replace(normalized, string.Empty);
        }
        normalized = normalized.Trim();

        if (normalized.Length > maxLength)
        {
            normalized = normalized[..maxLength].TrimEnd();
        }

        return normalized;
    }
}
