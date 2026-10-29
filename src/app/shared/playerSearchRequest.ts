export type PlayerSearchRequest = Readonly<{ scopeId: string, requestId: string }>

export function parsePlayerSearchRequest(value: unknown): PlayerSearchRequest | undefined {
  if (value === undefined) return undefined
  const request = value as Partial<PlayerSearchRequest> | null
  if (!request || typeof request !== `object`
    || typeof request.scopeId !== `string` || !/^[a-zA-Z0-9:-]{8,100}$/u.test(request.scopeId)
    || typeof request.requestId !== `string` || !/^[a-zA-Z0-9-]{8,100}$/u.test(request.requestId)) {
    throw new Error(`Invalid player search identity`)
  }
  return { scopeId: request.scopeId, requestId: request.requestId }
}
