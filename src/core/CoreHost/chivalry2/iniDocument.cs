using System.Text;
using System.Text.RegularExpressions;

namespace CoreHost.Chivalry2;

internal sealed class IniDocument
{
    private sealed record Line(string Text, string Ending);
    private sealed record Entry(int Index, string Section, string Key, int ValueStart, int ValueEnd, string Value);
    private readonly List<Line> lines;
    private readonly Encoding encoding;
    private readonly byte[] preamble;
    private static readonly StringComparer comparer = StringComparer.OrdinalIgnoreCase;

    private IniDocument(string text, Encoding encoding, byte[] preamble)
    {
        this.encoding = encoding;
        this.preamble = preamble;
        lines = Regex.Matches(text, @"([^\r\n]*)(\r\n|\r|\n|$)")
            .Where(match => match.Length > 0)
            .Select(match => new Line(match.Groups[1].Value, match.Groups[2].Value))
            .ToList();
    }

    internal static IniDocument parse(byte[] bytes)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        Encoding[] candidates = [new UTF32Encoding(false, true, true), new UTF32Encoding(true, true, true), new UTF8Encoding(true, true), new UnicodeEncoding(false, true, true), new UnicodeEncoding(true, true, true)];
        var encoding = candidates.FirstOrDefault(candidate => bytes.AsSpan().StartsWith(candidate.GetPreamble()));
        var preamble = encoding?.GetPreamble() ?? [];
        encoding ??= encodingWithoutPreamble(bytes);
        try
        {
            return new(encoding.GetString(bytes, preamble.Length, bytes.Length - preamble.Length), encoding, preamble);
        }
        catch (DecoderFallbackException) when (preamble.Length == 0 && encoding is UTF8Encoding)
        {
            encoding = Encoding.GetEncoding(1252, EncoderFallback.ExceptionFallback, DecoderFallback.ExceptionFallback);
            return new(encoding.GetString(bytes), encoding, []);
        }
        catch (DecoderFallbackException)
        {
            throw new Chivalry2ConfigException("INI_ENCODING_INVALID", "The configuration file contains invalid encoded text.", 422);
        }
    }

    internal Dictionary<string, Dictionary<string, string[]>> sections()
    {
        var result = new Dictionary<string, Dictionary<string, string[]>>(comparer);
        foreach (var line in lines)
        {
            if (sectionName(line.Text) is { } name) result.TryAdd(name, new(comparer));
        }
        foreach (var entry in entries())
        {
            if (!result.TryGetValue(entry.Section, out var section)) result[entry.Section] = section = new(comparer);
            section[entry.Key] = section.TryGetValue(entry.Key, out var values) ? [.. values, entry.Value] : [entry.Value];
        }
        return result;
    }

    internal string set(string key, string value, string? section)
    {
        value = value.Trim();
        var matches = entries().Where(entry => comparer.Equals(entry.Key, key) && (section is null || comparer.Equals(entry.Section, section))).ToArray();
        if (matches.Length > 1) throw new Chivalry2ConfigException("INI_KEY_AMBIGUOUS", "The key has multiple occurrences. Supply a unique section; repeated entries cannot be updated as a scalar.", 409);
        if (matches.Length == 1)
        {
            var entry = matches[0];
            var line = lines[entry.Index];
            if (entry.Value != value) lines[entry.Index] = line with { Text = $"{line.Text[..entry.ValueStart]}{value}{line.Text[entry.ValueEnd..]}" };
            return entry.Section;
        }

        if (section is null) throw new Chivalry2ConfigException("INI_SECTION_REQUIRED", "A section is required when adding a new key.");
        var headerIndex = lines.FindLastIndex(line => comparer.Equals(sectionName(line.Text), section));
        var insertIndex = headerIndex < 0 ? lines.Count : lines.FindIndex(headerIndex + 1, line => sectionName(line.Text) is not null);
        if (insertIndex < 0) insertIndex = lines.Count;
        var ending = lines.FirstOrDefault(line => line.Ending.Length > 0)?.Ending ?? "\n";
        var trailingEnding = lines.Count > 0 && lines[^1].Ending.Length > 0;
        if (insertIndex > 0 && lines[insertIndex - 1].Ending.Length == 0) lines[insertIndex - 1] = lines[insertIndex - 1] with { Ending = ending };
        if (headerIndex < 0) lines.Insert(insertIndex++, new($"[{section}]", ending));
        lines.Insert(insertIndex, new($"{key}={value}", insertIndex < lines.Count || trailingEnding ? ending : ""));
        return section;
    }

    internal byte[] bytes()
    {
        try
        {
            return [.. preamble, .. encoding.GetBytes(string.Concat(lines.Select(line => $"{line.Text}{line.Ending}")))];
        }
        catch (EncoderFallbackException)
        {
            throw new Chivalry2ConfigException("INI_VALUE_ENCODING", "The value cannot be represented in the configuration file's encoding.", 422);
        }
    }

    internal static void validate(string key, string value, string? section)
    {
        if (string.IsNullOrWhiteSpace(key) || key != key.Trim() || key.IndexOfAny(['=', '[', ']']) >= 0 || key[0] is ';' or '#' || key.Any(isLineControl) ||
            value is null || value.Any(character => character != '\t' && isLineControl(character)) ||
            section is not null && (string.IsNullOrWhiteSpace(section) || section != section.Trim() || section.IndexOfAny(['[', ']']) >= 0 || section.Any(isLineControl)))
        {
            throw new Chivalry2ConfigException("INVALID_REQUEST", "Supply a valid single-line key, value, and optional section.");
        }
    }

    private static bool isLineControl(char character) => char.IsControl(character) || character is '\u2028' or '\u2029';

    private static Encoding encodingWithoutPreamble(byte[] bytes)
    {
        // INI headers and comment markers are ASCII, exposing Unicode byte order.
        if (bytes.Length >= 4)
        {
            if (bytes[1] == 0 && bytes[2] == 0 && bytes[3] == 0) return new UTF32Encoding(false, false, true);
            if (bytes[0] == 0 && bytes[1] == 0 && bytes[2] == 0) return new UTF32Encoding(true, false, true);
        }
        if (bytes.Length >= 2)
        {
            if (bytes[1] == 0) return new UnicodeEncoding(false, false, true);
            if (bytes[0] == 0) return new UnicodeEncoding(true, false, true);
        }
        return new UTF8Encoding(false, true);
    }

    private IEnumerable<Entry> entries()
    {
        var section = "";
        for (var index = 0; index < lines.Count; index++)
        {
            var text = lines[index].Text;
            if (sectionName(text) is { } name)
            {
                section = name;
                continue;
            }
            var trimmed = text.TrimStart();
            var equals = text.IndexOf('=');
            if (trimmed.Length == 0 || trimmed[0] is ';' or '#' or '[' || equals < 1) continue;
            var key = text[..equals].Trim();
            if (key.Length == 0) continue;
            var end = valueEnd(text, equals + 1);
            while (end > equals + 1 && char.IsWhiteSpace(text[end - 1])) end--;
            var start = equals + 1;
            while (start < end && char.IsWhiteSpace(text[start])) start++;
            yield return new(index, section, key, start, end, text[start..end]);
        }
    }

    private static string? sectionName(string text)
    {
        var trimmed = text.Trim();
        var closing = trimmed.IndexOf(']');
        if (!trimmed.StartsWith('[') || closing < 1) return null;
        var suffix = trimmed[(closing + 1)..].TrimStart();
        return suffix.Length == 0 || suffix[0] is ';' or '#' ? trimmed[1..closing].Trim() : null;
    }

    private static int valueEnd(string text, int start)
    {
        var quoted = false;
        var escaped = false;
        var depth = 0;
        for (var index = start; index < text.Length; index++)
        {
            var character = text[index];
            if (escaped) { escaped = false; continue; }
            if (quoted && character == '\\') { escaped = true; continue; }
            if (character == '"') quoted = !quoted;
            if (quoted) continue;
            if (character == '(') depth++;
            if (character == ')') depth--;
            if (depth == 0 && character is ';' or '#' && (index == start || char.IsWhiteSpace(text[index - 1]))) return index;
        }
        return text.Length;
    }
}
