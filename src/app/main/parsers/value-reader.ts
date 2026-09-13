import type { CoreCallResult, JsonRecord } from '../types';

/**
 * Defensive accessors for unknown JSON envelopes.
 * These helpers keep Core/server casing differences and malformed payloads from leaking into callers.
 */
export class ValueReader {
  static getString(source: JsonRecord, key: string): string | null {
    const value = source[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  static getOriginalString(source: JsonRecord, key: string): string | null {
    const value = source[key]
    return typeof value === `string` && value.trim().length > 0 ? value : null
  }

  static getNumber(source: JsonRecord, key: string): number | null {
    const value = source[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  static getBoolean(source: JsonRecord | null, key: string): boolean | null {
    const value = source?.[key];

    if (typeof value === 'boolean') {
      return value;
    }

    if (value === 1 || value === '1' || value === 'true') {
      return true;
    }

    if (value === 0 || value === '0' || value === 'false') {
      return false;
    }

    return null;
  }

  static getEnvelopeData(result: CoreCallResult): JsonRecord | null {
    const envelope = ValueReader.isRecord(result.data) ? result.data : null;
    return ValueReader.isRecord(envelope?.data) ? envelope.data : null;
  }

  static getStringArray(source: JsonRecord, key: string): string[] | null {
    const value = source[key];

    if (!Array.isArray(value)) {
      return null;
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  static isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
