using System.Text.RegularExpressions;
using CoreHost.Models;

namespace CoreHost.Services;

public sealed class ListPlayersParser
{
    private const string ListPlayersHeader = "Name -  PlayFabPlayerId - EOSPlayerId - Score - Kills - Deaths - Ping";

    private static readonly Regex ColumnSeparatorRegex = new("\\s+-\\s+", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex ParenthesizedIdRegex = new("^(?<name>.+?)\\s*\\((?<id>[A-Za-z0-9_-]{4,128})\\)\\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex NameIdRegex = new("^Name:\\s*(?<name>.+?)\\s+ID:\\s*(?<id>[A-Za-z0-9_-]{4,128})\\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex PipeRegex = new("^(?<name>.+?)\\s*\\|\\s*(?<id>[A-Za-z0-9_-]{4,128})\\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex TrailingIdRegex = new("^(?<name>.+?)\\s+(?<id>[A-Za-z0-9_-]{4,128})\\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);
    private static readonly Regex ServerRegex = new("^Server(?:\\s*Name)?\\s*(?::|-)\\s*(?<server>.+)$", RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
    private static readonly Regex ServerEndpointRegex = new("^(?<server>.+?)\\s+(?<ip>(?:\\d{1,3}\\.){3}\\d{1,3}):(?<port>\\d{1,5})\\s*$", RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private readonly ListPlayersTextNormalizer _normalizer;

    public ListPlayersParser()
        : this(new ListPlayersTextNormalizer())
    {
    }

    public ListPlayersParser(ListPlayersTextNormalizer normalizer)
    {
        _normalizer = normalizer;
    }

    public ListPlayersParseResult Parse(string rawText)
    {
        var rawLines = SplitLines(rawText);

        var players = new List<PlayerEntry>();
        var warnings = new List<string>();
        string? serverName = null;
        string? normalizedServerName = null;
        string? serverIp = null;
        int? serverPort = null;
        string? serverAddress = null;

        foreach (var line in rawLines)
        {
            var serverMatch = ServerRegex.Match(line);
            if (serverMatch.Success)
            {
                var serverInfo = ParseServerInfo(serverMatch.Groups["server"].Value.Trim());
                serverName = serverInfo.ServerName;
                normalizedServerName = serverInfo.NormalizedServerName;
                serverIp = serverInfo.ServerIp;
                serverPort = serverInfo.ServerPort;
                serverAddress = serverInfo.ServerAddress;
                continue;
            }

            if (LooksLikeHeaderOrSeparator(line))
            {
                continue;
            }

            if (TryParsePlayerLine(line, players.Count, out var player))
            {
                players.Add(player);
                continue;
            }

            warnings.Add($"Unrecognized ListPlayers line: {line}");
        }

        if (rawLines.Length > 0 && players.Count == 0)
        {
            warnings.Add("No player rows matched known ListPlayers shapes.");
        }

        return new ListPlayersParseResult(rawText, serverName, normalizedServerName, serverIp, serverPort, serverAddress, players, rawLines, warnings);
    }

    public bool LooksLikeListPlayersOutput(string rawText)
    {
        if (string.IsNullOrWhiteSpace(rawText))
        {
            return false;
        }

        var rawLines = SplitLines(rawText);
        var headerIndex = Array.FindIndex(rawLines, IsListPlayersHeader);
        if (headerIndex < 0)
        {
            return rawLines.Any(line => ServerRegex.IsMatch(line)) &&
                rawLines.Any(line => line.Contains("playfab", StringComparison.OrdinalIgnoreCase));
        }

        if (rawLines.Any(line => ServerRegex.IsMatch(line)))
        {
            return true;
        }

        for (var index = headerIndex + 1; index < rawLines.Length; index++)
        {
            if (TryParseDashSeparatedPlayerLine(rawLines[index], 0, out _))
            {
                return true;
            }
        }

        return false;
    }

    private static string[] SplitLines(string rawText)
    {
        return rawText
            .Replace("\r\n", "\n", StringComparison.Ordinal)
            .Replace('\r', '\n')
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
    }

    private bool TryParsePlayerLine(string line, int index, out PlayerEntry player)
    {
        if (TryParseDashSeparatedPlayerLine(line, index, out player))
        {
            return true;
        }

        foreach (var regex in new[] { ParenthesizedIdRegex, NameIdRegex, PipeRegex, TrailingIdRegex })
        {
            var match = regex.Match(line);
            if (!match.Success)
            {
                continue;
            }

            var name = match.Groups["name"].Value.Trim();
            var playfabId = match.Groups["id"].Value.Trim();
            if (name.Length == 0 || playfabId.Length == 0)
            {
                continue;
            }

            player = new PlayerEntry(index, name, playfabId, line);
            return true;
        }

        player = null!;
        return false;
    }

    private bool TryParseDashSeparatedPlayerLine(string line, int index, out PlayerEntry player)
    {
        var parts = ColumnSeparatorRegex.Split(line.Trim());
        if (parts.Length < 6)
        {
            player = null!;
            return false;
        }

        foreach (var trailingColumnCount in new[] { 5, 4 })
        {
            var playfabIndex = parts.Length - trailingColumnCount - 1;

            if (playfabIndex < 1)
            {
                continue;
            }

            if (TryBuildDashSeparatedPlayer(line, index, parts, playfabIndex, out player))
            {
                return true;
            }
        }

        player = null!;
        return false;
    }

    private bool TryBuildDashSeparatedPlayer(string line, int index, string[] parts, int playfabIndex, out PlayerEntry player)
    {
        var trailingColumnCount = parts.Length - playfabIndex - 1;
        if (trailingColumnCount is not 4 and not 5)
        {
            player = null!;
            return false;
        }

        var name = string.Join(" - ", parts[..playfabIndex]).Trim();
        var playfabId = NormalizePlayfabColumnId(parts[playfabIndex]);
        if (name.Length == 0 || !IsLikelyPlayFabColumnId(playfabId))
        {
            player = null!;
            return false;
        }

        var eosPlayerId = parts[playfabIndex + 1].Length > 0 ? parts[playfabIndex + 1] : null;
        if (!TryParseInteger(parts[playfabIndex + 2], out var parsedScore) ||
            !TryParseInteger(parts[playfabIndex + 3], out var parsedKills))
        {
            player = null!;
            return false;
        }

        int? score = parsedScore;
        int? kills = parsedKills;
        int? deaths = null;
        int? pingMs;

        if (trailingColumnCount == 5)
        {
            if (!TryParseInteger(parts[playfabIndex + 4], out var parsedDeaths) ||
                !TryParsePing(parts[playfabIndex + 5], out var parsedPing))
            {
                player = null!;
                return false;
            }

            deaths = parsedDeaths;
            pingMs = parsedPing;
        }
        else
        {
            if (!TryParsePing(parts[playfabIndex + 4], out var parsedPing))
            {
                player = null!;
                return false;
            }

            pingMs = parsedPing;
        }

        player = new PlayerEntry(index, name, playfabId, line, eosPlayerId, score, kills, deaths, pingMs);
        return true;
    }

    private ParsedServerInfo ParseServerInfo(string value)
    {
        var serverName = value;
        string? serverIp = null;
        int? serverPort = null;
        string? serverAddress = null;

        var endpointMatch = ServerEndpointRegex.Match(value);
        if (endpointMatch.Success && int.TryParse(endpointMatch.Groups["port"].Value, out var parsedPort) && parsedPort is >= 0 and <= 65535)
        {
            serverName = endpointMatch.Groups["server"].Value.Trim();
            serverIp = endpointMatch.Groups["ip"].Value;
            serverPort = parsedPort;
            serverAddress = $"{serverIp}:{serverPort}";
        }

        var normalizedServerName = serverName.Length > 0 ? _normalizer.NormalizeServerName(serverName) : null;
        return new ParsedServerInfo(serverName, normalizedServerName, serverIp, serverPort, serverAddress);
    }

    private static bool TryParseInteger(string value, out int result)
    {
        return int.TryParse(value.Trim(), out result);
    }

    private static bool TryParsePing(string value, out int result)
    {
        var numeric = value.Replace("ms", string.Empty, StringComparison.OrdinalIgnoreCase).Trim();
        return int.TryParse(numeric, out result);
    }

    private static bool IsLikelyPlayerId(string value)
    {
        return value.Length is >= 4 and <= 128 && value.All(character => char.IsLetterOrDigit(character) || character is '_' or '-');
    }

    private static bool IsLikelyPlayFabColumnId(string value)
    {
        return IsNullPlayFabColumnId(value) ||
            value.Length is >= 8 and <= 128 &&
            value[0] != '-' &&
            value.Any(char.IsDigit) &&
            value.All(character => char.IsLetterOrDigit(character) || character is '_' or '-');
    }

    private static string NormalizePlayfabColumnId(string value)
    {
        var trimmed = value.Trim();
        return IsNullPlayFabColumnId(trimmed) ? "NULL" : trimmed;
    }

    private static bool IsNullPlayFabColumnId(string value)
    {
        return string.Equals(value.Trim(), "NULL", StringComparison.OrdinalIgnoreCase);
    }

    private static bool LooksLikeHeaderOrSeparator(string line)
    {
        return line.All(character => character is '-' or '=' or '_' or ' ') ||
            IsListPlayersHeader(line) ||
            line.Contains("listplayers", StringComparison.OrdinalIgnoreCase) ||
            line.Contains("playfabplayerid", StringComparison.OrdinalIgnoreCase) ||
            line.Contains("eosplayerid", StringComparison.OrdinalIgnoreCase) ||
            line.Equals("players", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsListPlayersHeader(string line)
    {
        var trimmed = line.Trim();
        return string.Equals(trimmed, ListPlayersHeader, StringComparison.Ordinal) ||
            trimmed.Contains("name", StringComparison.OrdinalIgnoreCase) &&
            trimmed.Contains("playfab", StringComparison.OrdinalIgnoreCase) &&
            trimmed.Contains("eos", StringComparison.OrdinalIgnoreCase) &&
            trimmed.Contains("ping", StringComparison.OrdinalIgnoreCase);
    }

    private sealed record ParsedServerInfo(
        string ServerName,
        string? NormalizedServerName,
        string? ServerIp,
        int? ServerPort,
        string? ServerAddress);
}
