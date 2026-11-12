import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { parsePlayerSearchRequest } from '../../shared/playerSearchRequest'

type PendingSearch = { requestId: string, frame: string, controller: AbortController }
type Owner = { requests: Map<string, PendingSearch>, dispose: () => void }

export class PlayerSearchRequests {
  private readonly owners = new WeakMap<WebContents, Owner>()

  public async run<T>(event: IpcMainInvokeEvent, identity: unknown, work: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    const request = parsePlayerSearchRequest(identity)
    if (!request) return work()
    const owner = this.owner(event.sender)
    const frame = `${event.processId}:${event.frameId}`
    const key = `${frame}:${request.scopeId}`
    owner.requests.get(key)?.controller.abort()
    if (!owner.requests.has(key) && owner.requests.size >= 32) throw new Error(`Too many pending player searches`)
    const current = { requestId: request.requestId, frame, controller: new AbortController() }
    owner.requests.set(key, current)
    if (!event.senderFrame || event.sender.isDestroyed?.()) current.controller.abort()
    try {
      return await work(current.controller.signal)
    } finally {
      if (owner.requests.get(key) === current) owner.requests.delete(key)
      if (owner.requests.size === 0) owner.dispose()
    }
  }

  public cancel(event: IpcMainInvokeEvent, identity: unknown): void {
    const request = parsePlayerSearchRequest(identity)
    if (!request) return
    const current = this.owners.get(event.sender)?.requests.get(`${event.processId}:${event.frameId}:${request.scopeId}`)
    if (current?.requestId === request.requestId) current.controller.abort()
  }

  private owner(sender: WebContents): Owner {
    const existing = this.owners.get(sender)
    if (existing) return existing
    const requests = new Map<string, PendingSearch>()
    const cancel = () => {
      for (const pending of requests.values()) pending.controller.abort()
      requests.clear()
      dispose()
    }
    const navigate = (details: unknown, _url?: string, inPlace?: boolean, mainFrame?: boolean,
      processId?: number, routingId?: number) => {
      const event = details as { isSameDocument?: boolean, isMainFrame?: boolean, frame?: { processId: number, routingId: number } } | undefined
      if (event?.isSameDocument ?? inPlace) return
      if (event?.isMainFrame ?? mainFrame) {
        cancel()
        return
      }
      const frame = `${event?.frame?.processId ?? processId}:${event?.frame?.routingId ?? routingId}`
      for (const pending of requests.values()) if (pending.frame === frame) pending.controller.abort()
    }
    const dispose = () => {
      sender.removeListener(`destroyed`, cancel)
      sender.removeListener(`render-process-gone`, cancel)
      sender.removeListener(`did-start-navigation`, navigate)
      if (this.owners.get(sender)?.requests === requests) this.owners.delete(sender)
    }
    sender.once(`destroyed`, cancel)
    sender.once(`render-process-gone`, cancel)
    sender.on(`did-start-navigation`, navigate)
    const owner = { requests, dispose }
    this.owners.set(sender, owner)
    return owner
  }
}
