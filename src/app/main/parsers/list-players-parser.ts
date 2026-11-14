import type { CoreCallResult, ListPlayersSnapshot, ListPlayersSnapshotPlayer } from '../types';
import { ValueReader } from './value-reader';

/**
 * Normalizes Core ListPlayers snapshots before server ingestion.
 * It accepts both JS-style and C#-style casing because snapshots may come from different envelope sources.
 */
export class ListPlayersSnapshotParser {
  static extract(result: CoreCallResult): ListPlayersSnapshot | null {
    const envelope = ValueReader.isRecord(result.data) ? result.data : null;
    const source = ValueReader.isRecord(envelope?.data) ? envelope.data : envelope;

    if (!source) {
      return null;
    }

    const playersValue = source.players ?? source.Players;

    if (!Array.isArray(playersValue)) {
      return null;
    }

    return {
      // CoreHost may emit C#-style or JS-style casing depending on the source envelope.
      serverName: ValueReader.getString(source, 'serverName') ?? ValueReader.getString(source, 'ServerName'),
      normalizedServerName: ValueReader.getString(source, 'normalizedServerName') ?? ValueReader.getString(source, 'NormalizedServerName'),
      serverIp: ValueReader.getString(source, 'serverIp') ?? ValueReader.getString(source, 'ServerIp'),
      serverPort: ValueReader.getNumber(source, 'serverPort') ?? ValueReader.getNumber(source, 'ServerPort'),
      serverAddress: ValueReader.getString(source, 'serverAddress') ?? ValueReader.getString(source, 'ServerAddress'),
      rawText: ValueReader.getString(source, 'rawText') ?? ValueReader.getString(source, 'RawText') ?? '',
      rawLines: ValueReader.getStringArray(source, 'rawLines') ?? ValueReader.getStringArray(source, 'RawLines') ?? [],
      parseWarnings: ValueReader.getStringArray(source, 'parseWarnings') ?? ValueReader.getStringArray(source, 'ParseWarnings') ?? [],
      players: playersValue
        .map((player, index) => ListPlayersSnapshotParser.normalizePlayer(player, index))
        .filter((player): player is ListPlayersSnapshotPlayer => player !== null)
    };
  }

  private static normalizePlayer(value: unknown, arrayIndex: number): ListPlayersSnapshotPlayer | null {
    if (!ValueReader.isRecord(value)) {
      return null;
    }

    const name = ValueReader.getOriginalString(value, 'name') ?? ValueReader.getOriginalString(value, 'Name');
    const playfabId =
      ValueReader.getString(value, 'playfabId') ??
      ValueReader.getString(value, 'playFabId') ??
      ValueReader.getString(value, 'PlayfabId') ??
      ValueReader.getString(value, 'PlayFabId') ??
      ValueReader.getString(value, 'playFabPlayerId') ??
      ValueReader.getString(value, 'PlayFabPlayerId');

    if (!name || !playfabId) {
      return null;
    }

    return {
      index: ValueReader.getNumber(value, 'index') ?? ValueReader.getNumber(value, 'Index') ?? arrayIndex,
      name,
      playfabId,
      rawLine: ValueReader.getString(value, 'rawLine') ?? ValueReader.getString(value, 'RawLine') ?? name,
      eosPlayerId: ValueReader.getString(value, 'eosPlayerId') ?? ValueReader.getString(value, 'EosPlayerId'),
      score: ValueReader.getNumber(value, 'score') ?? ValueReader.getNumber(value, 'Score'),
      kills: ValueReader.getNumber(value, 'kills') ?? ValueReader.getNumber(value, 'Kills'),
      deaths: ValueReader.getNumber(value, 'deaths') ?? ValueReader.getNumber(value, 'Deaths'),
      pingMs: ValueReader.getNumber(value, 'pingMs') ?? ValueReader.getNumber(value, 'PingMs')
    };
  }
}
