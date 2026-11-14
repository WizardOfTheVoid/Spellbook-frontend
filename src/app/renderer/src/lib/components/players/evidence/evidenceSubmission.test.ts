import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { EvidenceItem, EvidenceSelectedFile, EvidenceUploadProgress } from '$lib/core'
import type { EvidencePlayerSelection } from './navigation'
import { createEvidenceSubmission, getAvailableSubmittedEvidence, type EvidenceSubmissionDependencies } from './evidenceSubmission'

const player: EvidencePlayerSelection = {
  id: 42, playfabId: `ABCDEF1234567890`, latestName: `Samwise`, lastLogin: null,
  playtimeHours: null, activeBanKind: null, isOnline: false
}
const anotherPlayer = { ...player, id: 43, playfabId: `ABCDEF1234567891`, latestName: `Frodo` }
const files: EvidenceSelectedFile[] = [
  { id: `first`, name: `first.mp4`, kind: `video`, size: 1200, originalSha256: `a`.repeat(64) },
  { id: `second`, name: `second.png`, kind: `image`, size: 800, originalSha256: `b`.repeat(64) }
]

function item(id: number): EvidenceItem {
  return {
    id, playerId: 42, playfabId: player.playfabId, nickname: null, type: `cheating`,
    subtypes: [`flying`], createdAt: `2026-09-28T10:00:00Z`, authorName: `Admin`,
    duplicateCount: 0, duplicates: [],
    file: { kind: `image`, mimeType: `image/avif`, byteSize: 500, width: 640, height: 480, durationMs: null, url: `https://example.com/${id}.avif` },
    evidenceUrl: `https://example.com/evidence/${id}`, embedUrl: `https://example.com/embed/${id}`,
    wantedUrl: `https://example.com/wanted/42`, playerUrl: `https://example.com/players/42`,
    isWanted: false, candidateId: 5, reviewStatus: `candidate`
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>(done => resolve = done)
  return { promise, resolve }
}

function setup(overrides: Partial<EvidenceSubmissionDependencies> = {}) {
  const listeners = new Set<(progress: EvidenceUploadProgress) => void>()
  const released: string[] = []
  const uploads: Array<Parameters<EvidenceSubmissionDependencies[`upload`]>[0]> = []
  let completions = 0
  const submission = createEvidenceSubmission({
    selectFiles: async () => files,
    releaseFiles: async ids => { released.push(...ids) },
    loadNames: async () => [{ id: 7, name: `Samwise` }],
    checkDuplicates: async () => ({ count: 0, matches: [] }),
    upload: async input => {
      uploads.push(input)
      return item(uploads.length)
    },
    onProgress: listener => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    onComplete: () => { completions += 1 },
    now: () => 1000,
    ...overrides
  })
  submission.syncUser(1)
  return { submission, listeners, released, uploads, completions: () => completions }
}

async function prepare(submission: ReturnType<typeof createEvidenceSubmission>): Promise<void> {
  await submission.initialize(player)
  await submission.chooseFiles()
  for (const file of get(submission).drafts) submission.updateDraft(file.file.id, { nicknameId: 7, subtypes: [`flying`] })
  submission.continueToDetails()
  submission.nextFile()
  submission.nextFile()
}

test(`processing and draft state survive view subscribers leaving and returning`, async () => {
  const pending = deferred<EvidenceItem>()
  const uploads: string[] = []
  const { submission, listeners, released } = setup({
    upload: async input => {
      uploads.push(input.fileId)
      return uploads.length === 1 ? await pending.promise : item(2)
    }
  })
  await prepare(submission)
  const stopView = submission.subscribe(() => {})
  const running = submission.submit()
  stopView()
  await submission.submit()
  for (const listener of listeners) listener({ fileId: `unrelated`, phase: `converting`, completed: 400, total: 600 })
  assert.equal(get(submission).progress.phase, `uploading`)
  for (const listener of listeners) listener({ fileId: `first`, phase: `converting`, completed: 400, total: 600 })
  await submission.initialize(anotherPlayer)
  const restored = get(submission)
  assert.equal(restored.player?.id, 42)
  assert.equal(restored.step, `submitting`)
  assert.equal(restored.startedAt, 1000)
  assert.deepEqual(restored.progress, { fileId: `first`, phase: `converting`, completed: 400, total: 600 })
  assert.deepEqual(restored.drafts[0].subtypes, [`flying`])
  assert.equal(restored.drafts[0].nicknameId, 7)
  pending.resolve(item(1))
  await running
  assert.equal(get(submission).step, `done`)
  assert.deepEqual(get(submission).results.map(result => result.id), [1, 2])
  assert.deepEqual(uploads, [`first`, `second`])
  assert.deepEqual(released, [`first`, `second`])
  assert.equal(listeners.size, 0)
})

test(`a failed batch retains successful results and retries only remaining files`, async () => {
  const requests: string[] = []
  let fail = true
  const { submission, listeners, released } = setup({
    upload: async input => {
      requests.push(input.fileId)
      if (input.fileId === `second` && fail) throw new Error(`Connection lost`)
      return item(input.fileId === `first` ? 1 : 2)
    }
  })
  await prepare(submission)
  await submission.submit()
  assert.equal(get(submission).step, `review`)
  assert.equal(get(submission).error, `Connection lost`)
  assert.deepEqual(get(submission).results.map(result => result.id), [1])
  assert.deepEqual(released, [`first`])
  assert.equal(listeners.size, 0)
  await submission.initialize(anotherPlayer)
  submission.back()
  assert.equal(get(submission).step, `review`)
  fail = false
  await submission.submit()
  assert.deepEqual(requests, [`first`, `second`, `second`])
  assert.equal(get(submission).step, `done`)
  assert.deepEqual(get(submission).results.map(result => result.id), [1, 2])
  assert.deepEqual(released, [`first`, `second`])
})

test(`changing account hides the old job while retaining its source until the request settles`, async () => {
  const pending = deferred<EvidenceItem>()
  const requests: string[] = []
  const { submission, listeners, released, completions } = setup({
    upload: async input => {
      requests.push(input.fileId)
      return await pending.promise
    }
  })
  await prepare(submission)
  const running = submission.submit()
  const staleListener = [...listeners][0]
  submission.syncUser(null)
  submission.syncUser(2)
  await submission.initialize(anotherPlayer)
  assert.equal(get(submission).player?.id, 43)
  assert.deepEqual(get(submission).drafts, [])
  assert.deepEqual(released, [`second`])
  assert.equal(listeners.size, 0)
  staleListener({ fileId: `first`, phase: `saving`, completed: 1, total: 1 })
  pending.resolve(item(1))
  await running
  assert.equal(get(submission).step, `files`)
  assert.deepEqual(get(submission).results, [])
  assert.deepEqual(requests, [`first`])
  assert.deepEqual(released, [`second`, `first`])
  assert.equal(completions(), 0)
})

test(`a file selection returning after an account change is released and cannot enter the new draft`, async () => {
  const pending = deferred<EvidenceSelectedFile[]>()
  const { submission, released } = setup({ selectFiles: async () => await pending.promise })
  await submission.initialize(player)
  const selecting = submission.chooseFiles()
  submission.syncUser(2)
  await submission.initialize(anotherPlayer)
  pending.resolve(files)
  await selecting
  assert.equal(get(submission).player?.id, 43)
  assert.equal(get(submission).busy, false)
  assert.deepEqual(get(submission).drafts, [])
  assert.deepEqual(released, [`first`, `second`])
})

test(`identical originals keep their duplicate warning and remain eligible for submission`, async () => {
  const { submission, uploads } = setup({
    checkDuplicates: async () => ({ count: 1, matches: [{ id: 99, playerId: 42, playfabId: player.playfabId, createdAt: `2026-09-27T10:00:00Z`, evidenceUrl: `https://example.com/evidence/99` }] })
  })
  await prepare(submission)
  assert.deepEqual(get(submission).drafts.map(draft => draft.file.duplicateCount), [1, 1])
  assert.deepEqual(get(submission).drafts.map(draft => draft.file.duplicates[0].id), [99, 99])
  await submission.submit()
  assert.equal(get(submission).step, `done`)
  assert.deepEqual(uploads.map(input => input.fileId), [`first`, `second`])
})

test(`reset releases selected files and invalidates an old nickname lookup`, async () => {
  const names = deferred<Array<{ id: number, name: string }>>()
  const { submission, released } = setup({ loadNames: async () => await names.promise })
  const selectingPlayer = submission.initialize(player)
  await submission.chooseFiles()
  submission.reset(null)
  names.resolve([{ id: 7, name: `Samwise` }])
  await selectingPlayer
  assert.equal(get(submission).step, `player`)
  assert.equal(get(submission).player, null)
  assert.deepEqual(get(submission).names, [])
  assert.deepEqual(released, [`first`, `second`])
})

test(`nickname history failure leaves file selection and submission usable`, async () => {
  const { submission } = setup({ loadNames: async () => { throw new Error(`Offline`) } })
  await submission.initialize(player)
  assert.equal(get(submission).busy, false)
  assert.deepEqual(get(submission).names, [])
  await submission.chooseFiles()
  for (const draft of get(submission).drafts) submission.updateDraft(draft.file.id, { subtypes: [`flying`] })
  await submission.submit()
  assert.equal(get(submission).step, `done`)
})

test(`starting another submission clears completed results without releasing successful sources again`, async () => {
  const { submission, released } = setup()
  await prepare(submission)
  await submission.submit()
  submission.reset(anotherPlayer)
  assert.equal(get(submission).step, `files`)
  assert.equal(get(submission).player?.id, 43)
  assert.deepEqual(get(submission).results, [])
  assert.deepEqual(get(submission).drafts, [])
  assert.deepEqual(released, [`first`, `second`])
})

test(`retry timing starts at the new processing attempt while repeated account sync preserves the draft`, async () => {
  let now = 1000
  let fail = true
  const pending = deferred<EvidenceItem>()
  const { submission } = setup({
    now: () => now,
    upload: async () => {
      if (fail) throw new Error(`Offline`)
      return await pending.promise
    }
  })
  await prepare(submission)
  await submission.submit()
  now = 30000
  fail = false
  submission.syncUser(1)
  const retrying = submission.submit()
  assert.equal(get(submission).startedAt, 30000)
  assert.equal(get(submission).drafts.length, 2)
  pending.resolve(item(1))
  await retrying
})

test(`deleted submitted evidence stays excluded after remount while upload receipts remain intact`, async () => {
  const { submission } = setup()
  await prepare(submission)
  await submission.submit()
  const leaveView = submission.subscribe(() => {})
  submission.markEvidenceDeleted(1)
  leaveView()
  await submission.initialize(anotherPlayer)
  assert.deepEqual(getAvailableSubmittedEvidence(get(submission)).map(result => result.id), [2])
  assert.deepEqual(get(submission).results.map(result => result.id), [1, 2])
  submission.markEvidenceDeleted(2)
  assert.deepEqual(getAvailableSubmittedEvidence(get(submission)), [])
  assert.equal(get(submission).step, `done`)
  submission.reset(null)
  assert.deepEqual(get(submission).deletedEvidenceIds, [])
})

test(`deleting a successful item in a partial batch does not make retry upload it again`, async () => {
  const requests: string[] = []
  let fail = true
  const { submission } = setup({
    upload: async input => {
      requests.push(input.fileId)
      if (input.fileId === `second` && fail) throw new Error(`Connection lost`)
      return item(input.fileId === `first` ? 1 : 2)
    }
  })
  await prepare(submission)
  await submission.submit()
  submission.markEvidenceDeleted(1)
  assert.deepEqual(getAvailableSubmittedEvidence(get(submission)), [])
  assert.deepEqual(get(submission).results.map(result => result.id), [1])
  fail = false
  await submission.submit()
  assert.deepEqual(requests, [`first`, `second`, `second`])
  assert.deepEqual(getAvailableSubmittedEvidence(get(submission)).map(result => result.id), [2])
  assert.equal(get(submission).step, `done`)
})
