import type { EvidenceDuplicate, EvidenceDuplicateCheck, EvidenceSelectedFile } from '$lib/core'
import { checkEvidenceDuplicates } from './evidenceApi'

export type EvidenceDuplicatePreview = EvidenceSelectedFile & {
  status: `checking` | `checked` | `unavailable`
  duplicateCount: number | null
  duplicates: EvidenceDuplicate[]
}

export function startEvidenceDuplicateChecks(
  files: EvidenceSelectedFile[],
  onResult: (preview: EvidenceDuplicatePreview) => void,
  check: (size: number, sha256: string) => Promise<EvidenceDuplicateCheck> = checkEvidenceDuplicates
): EvidenceDuplicatePreview[] {
  const previews: EvidenceDuplicatePreview[] = files.map(file => ({
    ...file,
    status: file.originalSha256 ? `checking` : `unavailable`,
    duplicateCount: null,
    duplicates: []
  }))

  for (const file of previews) {
    const sha256 = file.originalSha256
    if (!sha256) continue
    const checkFile = async () => {
      try {
        const result = await check(file.size, sha256)
        onResult({ ...file, status: `checked`, duplicateCount: result.count, duplicates: result.matches })
      } catch {
        onResult({ ...file, status: `unavailable`, duplicateCount: null, duplicates: [] })
      }
    }
    void checkFile()
  }

  return previews
}
