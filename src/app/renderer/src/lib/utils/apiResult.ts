import { extractEnvelope, getCoreErrorMessage, type CoreCallResult } from "$lib/core"

export class ApiResultError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = `ApiResultError`
  }
}

export async function unwrap<T>(result: CoreCallResult, fallback: string): Promise<T> {
  const envelope = extractEnvelope<T>(result)

  if (!result.ok || envelope?.ok === false) {
    throw new ApiResultError(getCoreErrorMessage(result, fallback), result.status)
  }

  return (envelope && Object.prototype.hasOwnProperty.call(envelope, `data`)
    ? envelope.data
    : result.data) as T
}
