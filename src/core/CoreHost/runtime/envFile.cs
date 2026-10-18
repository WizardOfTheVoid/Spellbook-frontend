namespace CoreHost.Runtime;

static class EnvFile
{
    public static string? ActivePath { get; private set; }
    public static void Load(params string[] candidatePaths)
    {
        var seenPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var candidatePath in candidatePaths)
        {
            if (string.IsNullOrWhiteSpace(candidatePath))
            {
                continue;
            }

            var path = Path.GetFullPath(candidatePath);
            if (!seenPaths.Add(path) || !File.Exists(path))
            {
                continue;
            }
            ActivePath ??= path;

            foreach (var line in File.ReadAllLines(path))
            {
                SetVariable(line);
            }
        }
    }

    private static void SetVariable(string line)
    {
        var trimmed = line.Trim();
        if (trimmed.Length == 0 || trimmed.StartsWith('#'))
        {
            return;
        }

        const string exportPrefix = "export ";
        if (trimmed.StartsWith(exportPrefix, StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed[exportPrefix.Length..].TrimStart();
        }

        var separatorIndex = trimmed.IndexOf('=');
        if (separatorIndex <= 0)
        {
            return;
        }

        var key = trimmed[..separatorIndex].Trim();
        var value = trimmed[(separatorIndex + 1)..].Trim();
        if (key.Length == 0 || Environment.GetEnvironmentVariable(key) is not null)
        {
            return;
        }

        Environment.SetEnvironmentVariable(key, parseValue(value));
    }

    private static string parseValue(string value)
    {
        var quote = '\0';
        for (var index = 0; index < value.Length; index++)
        {
            var character = value[index];
            if (quote == '"' && character == '\\' && index + 1 < value.Length) { index++; continue; }
            if (quote != '\0')
            {
                if (character == quote) quote = '\0';
            }
            else if (index == 0 && character is '"' or '\'') quote = character;
            else if (character == '#' && (index == 0 || char.IsWhiteSpace(value[index - 1])))
            {
                value = value[..index].TrimEnd();
                break;
            }
        }

        if (value.Length >= 2 &&
            ((value[0] == '"' && value[^1] == '"') ||
            (value[0] == '\'' && value[^1] == '\'')))
        {
            return value[1..^1];
        }

        return value;
    }
}
