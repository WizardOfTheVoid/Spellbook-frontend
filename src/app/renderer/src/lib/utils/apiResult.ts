import { extractEnvelope, getCoreErrorMessage, type CoreCallResult } from "$lib/core"

export async function unwrap<T>(result: CoreCallResult, fallback: string): Promise<T> {
  const envelope = extractEnvelope<T>(result)

  if (!result.ok || envelope?.ok === false) {
    throw new Error(getCoreErrorMessage(result, fallback))
  }

  return (envelope && Object.prototype.hasOwnProperty.call(envelope, `data`)
    ? envelope.data
    : result.data) as T
}
