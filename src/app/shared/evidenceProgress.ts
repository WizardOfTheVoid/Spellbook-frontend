export type EvidenceProgress = {
  phase: `uploading` | `probing` | `converting` | `validating` | `reusing` | `saving`
  completed: number
  total: number | null
}

export type EvidenceUploadProgress = EvidenceProgress & { fileId: string }
