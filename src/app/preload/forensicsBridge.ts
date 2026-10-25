import type { CoreCallResult } from '../main/types'

export function createForensicsBridge(ipc: { invoke(channel: string, ...args: unknown[]): Promise<unknown> }) {
  return {
    vectors: async () => await ipc.invoke(`server:forensics:alt:vectors`) as CoreCallResult,
    ping: async (playerId: number) => await ipc.invoke(`server:forensics:alt:ping`, playerId) as CoreCallResult,
    triangulate: async (playerId: number) => await ipc.invoke(`server:forensics:alt:triangulate`, playerId) as CoreCallResult
  }
}
