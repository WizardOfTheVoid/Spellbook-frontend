import type { EvidenceUploadProgress } from '../shared/evidenceProgress'

type Listener = (event: unknown, progress: EvidenceUploadProgress) => void
type EvidenceIpc = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: Listener): unknown
  removeListener(channel: string, listener: Listener): unknown
}

export function createEvidenceBridge(ipc: EvidenceIpc) {
  return {
    comment: (evidenceId: number, body: string, positionMs: number | null = null) => ipc.invoke(`server:evidence:comment`, { evidenceId, body, positionMs }),
    offenses: (evidenceId: number, offenseIds: number[]) => ipc.invoke(`server:evidence:offenses`, { evidenceId, offenseIds }),
    view: (evidenceId: number, sessionId: string, watchedMs: number) => ipc.invoke(`server:evidence:view`, { evidenceId, sessionId, watchedMs }),
    delete: (evidenceId: number) => ipc.invoke(`server:evidence:delete`, { evidenceId }),
    deleteComment: (evidenceId: number, commentId: number) => ipc.invoke(`server:evidence:delete-comment`, { evidenceId, commentId }),
    release: (ids: string[]) => ipc.invoke(`server:evidence:release`, ids),
    onProgress(callback: (progress: EvidenceUploadProgress) => void): () => void {
      const listener: Listener = (_event, progress) => callback(progress)
      ipc.on(`server:evidence:progress`, listener)
      return () => { ipc.removeListener(`server:evidence:progress`, listener) }
    }
  }
}
