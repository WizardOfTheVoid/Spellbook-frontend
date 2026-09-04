/**
 * Creates readable request IDs for overlay-originated work.
 * The prefix keeps Electron IPC calls easy to connect to Core/server responses in logs.
 */
export class RequestIdFactory {
  constructor(private readonly prefix: string) {}

  next(scope: string): string {
    return `${this.prefix}-${scope}-${Date.now().toString(36)}`;
  }
}