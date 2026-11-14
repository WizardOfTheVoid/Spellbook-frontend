import type { CoreCallResult } from '../types';
import { ValueReader } from '../parsers/value-reader';

/**
 * Handles response bodies whose content may be JSON or plain text.
 * It also normalizes envelope error messages so IPC handlers return consistent failures.
 */
export class ResponseParser {
  static parseText(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  static getCallErrorMessage(result: CoreCallResult, fallback: string): string {
    const envelope = ValueReader.isRecord(result.data) ? result.data : null;
    const error = ValueReader.isRecord(envelope?.error) ? envelope.error : result.error;
    const message = ValueReader.isRecord(error)
      ? ValueReader.getString(error, 'message') ?? ValueReader.getString(error, 'Message')
      : result.error?.message;

    return message ?? result.statusText ?? fallback;
  }
}