import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { fingerprintEvidenceFile } from './evidenceFingerprint'

type SelectionOptions = {
  overlay?: { hide(): void, show(): void }
  pick?: () => Promise<{ canceled: boolean, filePaths: string[] }>
  fingerprint?: typeof fingerprintEvidenceFile
}

export class EvidenceFileSelection {
  private readonly files = new Map<string, { path: string, kind: `image` | `video` }>()

  constructor(private readonly options: SelectionOptions = {}) {}

  async select() {
    let chosen: { canceled: boolean, filePaths: string[] }
    this.options.overlay?.hide()
    try {
      chosen = await (this.options.pick ?? pickFiles)()
    } finally { this.options.overlay?.show() }
    if (chosen.canceled) return []
    const files = []
    for (const path of chosen.filePaths.slice(0, 20)) {
      const kind = [`png`, `jpg`, `jpeg`, `webp`, `avif`].includes(extname(path).slice(1).toLowerCase()) ? `image` as const : `video` as const
      const { size, originalSha256 } = await (this.options.fingerprint ?? fingerprintEvidenceFile)(path)
      const id = randomUUID()
      this.files.set(id, { path, kind })
      files.push({ id, name: basename(path), kind, size, originalSha256 })
    }
    return files
  }

  get(id: string) { return this.files.get(id) }

  release(ids: string[]): void {
    for (const id of ids) this.files.delete(id)
  }
}

async function pickFiles() {
  const { dialog } = await import(`electron`)
  return dialog.showOpenDialog({
    properties: [`openFile`, `multiSelections`],
    filters: [{ name: `Screenshots and videos`, extensions: [`png`, `jpg`, `jpeg`, `webp`, `avif`, `mp4`, `mov`, `mkv`, `webm`] }]
  })
}
