export const wantedActionTypes = [`ban`, `unban`, `mock`] as const
export const wantedOffenseTypes = [
  `hacker`,
  `ffa`,
  `verbal_abuse`,
  `griefing`,
  `exploiting`,
  `toxic_behavior`,
  `low_level`,
  `votekick_abuse`,
  `other`
] as const

export type WantedActionType = typeof wantedActionTypes[number]
export type WantedOffenseType = typeof wantedOffenseTypes[number]
export type WantedCreationType = `manual` | `auto`

export type WantedWork = Readonly<{
  wantedId: number
  sourceActionId: number
  targetServerId: number
  playfabId: string
  actionType: WantedActionType
  offenseType: WantedOffenseType | null
  duration: number | null
  sourceReason: string | null
  creationType: WantedCreationType
  cycleRevision: number
  attemptNumber: 1 | 2
  announce: boolean
}>

export type WantedWorkSnapshot = Readonly<{
  version: number
  observedAt: string
  gameServerId: number
  players: readonly Readonly<{ playfabId: string }>[]
}>

export type WantedMessageContext = Readonly<{
  admin: string
  serverName: string
  clanName: string
  clanTag: string
  variables: readonly Readonly<{ key: string, value: string }>[]
}>

export type WantedWorkPage = Readonly<{
  work: readonly WantedWork[]
  messageContext: WantedMessageContext
}>

export type WantedClaim = Readonly<{
  id: number
  wantedId: number
  sourceActionId: number
  gameServerId: number
  token: string
}>

export type WantedFailure = Readonly<{ code?: string, message?: string }>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u

export class WantedRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message)
    this.name = `WantedRequestError`
  }
}

export class WantedWorkClient {
  constructor(private readonly http: Pick<HttpClient, `postServer`>) {}

  async listWork(snapshot: WantedWorkSnapshot): Promise<WantedWorkPage> {
    const data = await this.post(`/wanted/work`, {
      gameServerId: snapshot.gameServerId,
      playfabIds: snapshot.players.map(player => player.playfabId),
      snapshotVersion: snapshot.version,
      observedAt: snapshot.observedAt
    })
    if (!isRecord(data) || !Array.isArray(data.work) || !isMessageContext(data.messageContext)) {
      throw malformed()
    }

    const work = data.work.map(parseWork)
    return { work, messageContext: data.messageContext }
  }

  async claim(work: WantedWork, gameServerId: number): Promise<WantedClaim | null> {
    const data = await this.post(`/wanted/claims`, {
      wantedId: work.wantedId,
      sourceActionId: work.sourceActionId,
      gameServerId,
      cycleRevision: work.cycleRevision,
      attemptNumber: work.attemptNumber
    })
    if (data === null) return null

    const claim = parseClaim(data)
    if (claim.wantedId !== work.wantedId
      || claim.sourceActionId !== work.sourceActionId
      || claim.gameServerId !== gameServerId) {
      throw malformed(`Wanted claim correlation mismatch.`)
    }
    return claim
  }

  async recordAttempt(claim: WantedClaim, work: WantedWork, automaticReason: string): Promise<void> {
    const result = await this.http.postServer(`/wanted/claims/${claim.id}/attempt`, {
      token: claim.token,
      cycleRevision: work.cycleRevision,
      automaticReason
    })
    if (!result.ok) throw requestError(result)
    if (result.status !== 204 || result.data !== null) throw malformed()
  }

  async complete(claim: WantedClaim, automaticReason: string): Promise<void> {
    await this.post(`/wanted/claims/${claim.id}/complete`, {
      token: claim.token,
      automaticReason
    })
  }

  async fail(claim: WantedClaim, failure: WantedFailure = {}): Promise<void> {
    const result = await this.http.postServer(`/wanted/claims/${claim.id}/fail`, {
      token: claim.token,
      ...(failure.code === undefined ? {} : { code: failure.code }),
      ...(failure.message === undefined ? {} : { message: failure.message })
    })
    if (!result.ok) throw requestError(result)
    if (result.status !== 204 || result.data !== null) throw malformed()
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const result = await this.http.postServer(path, body)
    if (!result.ok) throw requestError(result)
    if (!isRecord(result.data) || result.data.ok !== true || !Object.hasOwn(result.data, `data`)) {
      throw malformed()
    }
    return result.data.data
  }
}

function parseWork(value: unknown): WantedWork {
  if (!isRecord(value)
    || !positiveInteger(value.wantedId)
    || !positiveInteger(value.sourceActionId)
    || !positiveInteger(value.targetServerId)
    || !nonblankString(value.playfabId)
    || !wantedActionTypes.includes(value.actionType as WantedActionType)
    || !(value.offenseType === null || wantedOffenseTypes.includes(value.offenseType as WantedOffenseType))
    || !(value.duration === null || positiveInteger(value.duration))
    || !(value.sourceReason === null || typeof value.sourceReason === `string`)
    || !(value.creationType === `manual` || value.creationType === `auto`)
    || !nonnegativeInteger(value.cycleRevision)
    || !(value.attemptNumber === 1 || value.attemptNumber === 2)
    || typeof value.announce !== `boolean`) {
    throw malformed()
  }

  return {
    wantedId: value.wantedId,
    sourceActionId: value.sourceActionId,
    targetServerId: value.targetServerId,
    playfabId: value.playfabId,
    actionType: value.actionType as WantedActionType,
    offenseType: value.offenseType as WantedOffenseType | null,
    duration: value.duration,
    sourceReason: value.sourceReason,
    creationType: value.creationType,
    cycleRevision: value.cycleRevision,
    attemptNumber: value.attemptNumber,
    announce: value.announce
  }
}

function parseClaim(value: unknown): WantedClaim {
  if (!isRecord(value)
    || !positiveInteger(value.id)
    || !positiveInteger(value.wantedId)
    || !positiveInteger(value.sourceActionId)
    || !positiveInteger(value.gameServerId)
    || typeof value.token !== `string`
    || !uuidPattern.test(value.token)) {
    throw malformed()
  }
  return {
    id: value.id,
    wantedId: value.wantedId,
    sourceActionId: value.sourceActionId,
    gameServerId: value.gameServerId,
    token: value.token
  }
}

function isMessageContext(value: unknown): value is WantedMessageContext {
  return isRecord(value)
    && typeof value.admin === `string`
    && typeof value.serverName === `string`
    && typeof value.clanName === `string`
    && typeof value.clanTag === `string`
    && Array.isArray(value.variables)
    && value.variables.every(variable => isRecord(variable)
      && typeof variable.key === `string`
      && typeof variable.value === `string`)
}

function requestError(result: CoreCallResult): WantedRequestError {
  const envelope = isRecord(result.data) ? result.data : null
  const error = isRecord(envelope?.error) ? envelope.error : null
  const message = typeof error?.message === `string`
    ? error.message
    : result.error?.message ?? result.statusText ?? `Wanted request failed.`
  const code = typeof error?.code === `string`
    ? error.code
    : result.error?.code ?? `WANTED_REQUEST_FAILED`
  return new WantedRequestError(message, result.status, code)
}

function malformed(message = `Wanted response was malformed.`): WantedRequestError {
  return new WantedRequestError(message, 200, `MALFORMED_WANTED_RESPONSE`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === `object` && value !== null && !Array.isArray(value)
}

function positiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function nonblankString(value: unknown): value is string {
  return typeof value === `string` && Boolean(value.trim())
}
import type { HttpClient } from '../api/http-client'
import type { CoreCallResult } from '../types'
