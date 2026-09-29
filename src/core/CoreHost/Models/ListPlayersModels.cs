namespace CoreHost.Models;

public sealed record ListPlayersParseResult(
    string RawText,
    string? ServerName,
    string? NormalizedServerName,
    string? ServerIp,
    int? ServerPort,
    string? ServerAddress,
    IReadOnlyList<PlayerEntry> Players,
    IReadOnlyList<string> RawLines,
    IReadOnlyList<string> ParseWarnings);

public sealed record PlayerEntry(
    int Index,
    string Name,
    string PlayfabId,
    string RawLine,
    string? EosPlayerId = null,
    int? Score = null,
    int? Kills = null,
    int? Deaths = null,
    int? PingMs = null);

public sealed record LastListPlayersSummary(DateTimeOffset TimestampUtc, string? ServerName, int PlayerCount);
