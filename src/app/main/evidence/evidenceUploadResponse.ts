import type { CoreCallResult } from '../types'
import type { EvidenceProgress } from '../../shared/evidenceProgress'
import { ResponseParser } from '../api/response-parser'

export async function readEvidenceUploadResponse(response: Response, onProgress?: (progress: EvidenceProgress) => void): Promise<CoreCallResult> {
  if (!response.headers.get(`content-type`)?.includes(`application/x-ndjson`)) {
    return { ok: response.ok, status: response.status, statusText: response.statusText, data: ResponseParser.parseText(await response.text()) }
  }
  if (!response.body) throw new Error(`Evidence upload returned no response.`)
  let pending = ``
  let result: CoreCallResult | undefined
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      pending += decoder.decode(value, { stream: !done })
      const lines = pending.split(`\n`)
      pending = lines.pop() ?? ``
      if (done && pending.trim()) lines.push(pending)
      for (const line of lines) {
        if (!line.trim()) continue
        const message = JSON.parse(line) as { progress?: EvidenceProgress, result?: CoreCallResult }
        if (message.progress) onProgress?.(message.progress)
        if (message.result) result = message.result
      }
      if (done) break
    }
  } finally { reader.releaseLock() }
  if (!result) throw new Error(`Evidence processing ended before a result was received. Check the connection and retry.`)
  return result
}
