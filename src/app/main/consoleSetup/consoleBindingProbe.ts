import type { ConsoleKeyCode } from '../../shared/consoleKey'
import type { HttpClient } from '../api/http-client'
import type { CoreCallResult } from '../types'

export class ConsoleBindingProbe {
  constructor(private readonly http: Pick<HttpClient, `executeAction`>) {}

  async run(id: string, key: ConsoleKeyCode, signal: AbortSignal): Promise<CoreCallResult> {
    return await this.http.executeAction([{ type: `console`, command: `ListPlayers`, consoleKey: key, expectClipboard: true, keyboardLayoutId: `detect` }],
      { id, author: `user`, priority: `normal`, signal })
  }
}
