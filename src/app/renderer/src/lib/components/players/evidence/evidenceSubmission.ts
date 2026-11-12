import { writable } from 'svelte/store'
import type { EvidenceDuplicateCheck, EvidenceItem, EvidenceProgress, EvidenceSelectedFile, EvidenceUploadProgress } from '$lib/core'
import { startEvidenceDuplicateChecks, type EvidenceDuplicatePreview } from '$lib/utils/evidenceDuplicates'
import type { EvidencePlayerSelection } from './navigation'

type EvidenceDraft = { file: EvidenceDuplicatePreview, nicknameId: number | null, subtypes: string[] }
type Nickname = { id: number, name: string }
type UploadInput = { fileId: string, playerId?: number, playfabId?: string, nicknameId: number | null, subtypes: string[] }

export type EvidenceSubmissionState = {
  userId: number | null
  step: `player` | `files` | `details` | `review` | `submitting` | `done`
  player: EvidencePlayerSelection | null
  names: Nickname[]
  drafts: EvidenceDraft[]
  fileIndex: number
  results: EvidenceItem[]
  deletedEvidenceIds: number[]
  progress: EvidenceProgress
  startedAt: number
  busy: boolean
  error: string | null
}

export type EvidenceSubmissionDependencies = {
  selectFiles(): Promise<EvidenceSelectedFile[]>
  releaseFiles(ids: string[]): Promise<void>
  loadNames(playfabId: string): Promise<Nickname[]>
  checkDuplicates(size: number, sha256: string): Promise<EvidenceDuplicateCheck>
  upload(input: UploadInput): Promise<EvidenceItem>
  onProgress(listener: (progress: EvidenceUploadProgress) => void): () => void
  onComplete?(state: EvidenceSubmissionState): void
  now?(): number
}

const initialState = (userId: number | null): EvidenceSubmissionState => ({
  userId, step: `player`, player: null, names: [], drafts: [], fileIndex: 0, results: [], deletedEvidenceIds: [],
  progress: { phase: `uploading`, completed: 0, total: null }, startedAt: 0, busy: false, error: null
})
const message = (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback

export const getAvailableSubmittedEvidence = (state: Pick<EvidenceSubmissionState, `results` | `deletedEvidenceIds`>) =>
  state.results.filter(result => !state.deletedEvidenceIds.includes(result.id))

export function createEvidenceSubmission(deps: EvidenceSubmissionDependencies) {
  let current = initialState(null)
  const state = writable(current)
  let generation = 0
  let namesRevision = 0
  const activeFiles = new Set<string>()
  const progressListeners = new Set<() => void>()
  const change = (patch: Partial<EvidenceSubmissionState>) => {
    current = { ...current, ...patch }
    state.set(current)
  }
  const isCurrent = (version: number) => generation === version

  async function release(ids: string[]): Promise<void> {
    if (!ids.length) return
    try { await deps.releaseFiles(ids) }
    catch { /* A completed upload also releases its source in the main process. */ }
  }

  function clear(userId: number | null): void {
    generation += 1
    namesRevision += 1
    const ids = current.drafts.slice(current.results.length).map(draft => draft.file.id).filter(id => !activeFiles.has(id))
    for (const stop of progressListeners) stop()
    progressListeners.clear()
    current = initialState(userId)
    state.set(current)
    void release(ids)
  }

  function syncUser(userId: number | null): void {
    if (current.userId !== userId) clear(userId)
  }

  async function choosePlayer(player: EvidencePlayerSelection | null): Promise<void> {
    if (current.busy || current.results.length || current.userId === null) return
    const revision = ++namesRevision
    const version = generation
    const drafts = current.player?.playfabId === player?.playfabId
      ? current.drafts : current.drafts.map(draft => ({ ...draft, nicknameId: null }))
    change({ player, drafts, names: [], error: null, step: player ? `files` : `player` })
    if (!player || player.id === null) return
    try {
      const names = await deps.loadNames(player.playfabId)
      if (isCurrent(version) && namesRevision === revision) change({ names })
    } catch {
      if (isCurrent(version) && namesRevision === revision) change({ error: `Nickname history could not be loaded. You can use None listed.` })
    }
  }

  async function initialize(player: EvidencePlayerSelection | null): Promise<void> {
    if (player && !current.player && !current.drafts.length && current.step === `player`) await choosePlayer(player)
  }

  async function chooseFiles(): Promise<void> {
    if (current.busy || current.results.length || !current.player) return
    const version = generation
    change({ busy: true, error: null })
    try {
      const files = await deps.selectFiles()
      if (!isCurrent(version)) {
        await release(files.map(file => file.id))
        return
      }
      const large = files.filter(file => file.size > 250 * 1024 * 1024)
      if (large.length) {
        await release(files.map(file => file.id))
        if (isCurrent(version)) change({ error: `${large.length} file${large.length === 1 ? `` : `s`} exceeded the 250 MB upload limit.` })
        return
      }
      const previews = startEvidenceDuplicateChecks(files, file => {
        if (isCurrent(version)) change({ drafts: current.drafts.map(draft => draft.file.id === file.id ? { ...draft, file } : draft) })
      }, deps.checkDuplicates)
      change({ drafts: [...current.drafts, ...previews.map(file => ({ file, nicknameId: null, subtypes: [] }))] })
    } catch (cause) {
      if (isCurrent(version)) change({ error: message(cause, `Files could not be selected.`) })
    } finally { if (isCurrent(version)) change({ busy: false }) }
  }

  async function removeFile(id: string): Promise<void> {
    if (current.busy || current.results.length) return
    const version = generation
    change({ drafts: current.drafts.filter(draft => draft.file.id !== id) })
    try { await deps.releaseFiles([id]) }
    catch (cause) { if (isCurrent(version)) change({ error: message(cause, `File selection could not be released.`) }) }
  }

  function updateDraft(id: string, patch: Partial<Pick<EvidenceDraft, `nicknameId` | `subtypes`>>): void {
    if (current.busy || current.results.length) return
    change({ drafts: current.drafts.map(draft => draft.file.id === id ? { ...draft, ...patch } : draft) })
  }

  function continueToDetails(): void {
    if (!current.busy && current.drafts.length && !current.results.length) change({ fileIndex: 0, step: `details`, error: null })
  }

  function nextFile(): void {
    if (current.busy || current.step !== `details`) return
    if (!current.drafts[current.fileIndex]?.subtypes.length) {
      change({ error: `Select at least one cheat subtype.` })
      return
    }
    change(current.fileIndex + 1 < current.drafts.length
      ? { fileIndex: current.fileIndex + 1, error: null }
      : { step: `review`, error: null })
  }

  function back(): void {
    if (current.busy || current.results.length) return
    if (current.step === `review`) change({ fileIndex: current.drafts.length - 1, step: `details`, error: null })
    else if (current.step === `details`) change(current.fileIndex ? { fileIndex: current.fileIndex - 1, error: null } : { step: `files`, error: null })
  }

  async function submit(): Promise<void> {
    if (current.busy || current.userId === null || !current.player || !current.drafts.length || current.step === `done`) return
    if (current.drafts.some(draft => !draft.subtypes.length)) {
      change({ error: `Select at least one cheat subtype for each file.` })
      return
    }
    const version = generation
    const player = current.player
    const drafts = current.drafts
    let activeFileId: string | null = null
    let stopProgress: (() => void) | null = null
    change({ busy: true, step: `submitting`, error: null, startedAt: (deps.now ?? Date.now)() })
    try {
      stopProgress = deps.onProgress(progress => {
        if (isCurrent(version) && progress.fileId === activeFileId) change({ progress })
      })
      progressListeners.add(stopProgress)
      while (isCurrent(version) && current.results.length < drafts.length) {
        const draft = drafts[current.results.length]
        activeFileId = draft.file.id
        activeFiles.add(activeFileId)
        change({ progress: { phase: `uploading`, completed: 0, total: draft.file.size } })
        try {
          const result = await deps.upload({
            fileId: draft.file.id, ...(player.id === null ? { playfabId: player.playfabId } : { playerId: player.id }),
            nicknameId: draft.nicknameId, subtypes: draft.subtypes
          })
          if (!isCurrent(version)) return
          change({ results: [...current.results, result] })
          await release([draft.file.id])
        } finally {
          activeFiles.delete(draft.file.id)
          if (!isCurrent(version)) await release([draft.file.id])
          activeFileId = null
        }
      }
      if (isCurrent(version)) {
        change({ step: `done` })
        deps.onComplete?.(current)
      }
    } catch (cause) {
      if (isCurrent(version)) change({ error: message(cause, `Evidence could not be submitted.`), step: `review` })
    } finally {
      if (stopProgress && progressListeners.delete(stopProgress)) stopProgress()
      if (isCurrent(version)) change({ busy: false })
    }
  }

  function reset(player: EvidencePlayerSelection | null): void {
    if (current.busy) return
    clear(current.userId)
    void initialize(player)
  }

  function markEvidenceDeleted(id: number): void {
    if (current.results.some(result => result.id === id) && !current.deletedEvidenceIds.includes(id)) {
      change({ deletedEvidenceIds: [...current.deletedEvidenceIds, id] })
    }
  }

  return { subscribe: state.subscribe, syncUser, initialize, choosePlayer, chooseFiles, removeFile, updateDraft, continueToDetails, nextFile, back, submit, reset, markEvidenceDeleted }
}
