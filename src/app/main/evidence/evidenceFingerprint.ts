import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'

const maxUploadBytes = 250 * 1024 * 1024

export async function fingerprintEvidenceFile(path: string): Promise<{ size: number, originalSha256: string | null }> {
  const size = (await stat(path)).size
  if (size < 1 || size > maxUploadBytes) return { size, originalSha256: null }
  const hash = createHash(`sha256`)
  let bytes = 0
  for await (const chunk of createReadStream(path)) {
    bytes += chunk.length
    if (bytes > maxUploadBytes) return { size: bytes, originalSha256: null }
    hash.update(chunk)
  }
  return { size: bytes, originalSha256: hash.digest(`hex`) }
}
