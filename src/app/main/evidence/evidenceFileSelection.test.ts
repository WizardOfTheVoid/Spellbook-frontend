import assert from 'node:assert/strict'
import test from 'node:test'
import { EvidenceFileSelection } from './evidenceFileSelection'

test(`picker hides the overlay and restores it before fingerprints, and removal releases the selection`, async () => {
  const calls: string[] = []
  const files = new EvidenceFileSelection({
    overlay: { hide: () => { calls.push(`hide`) }, show: () => { calls.push(`show`) } },
    pick: async () => {
      calls.push(`pick`)
      return { canceled: false, filePaths: [`clip.mp4`] }
    },
    fingerprint: async () => {
      calls.push(`fingerprint`)
      return { size: 20, originalSha256: `a`.repeat(64) }
    }
  })
  const selected = await files.select()
  assert.deepEqual(calls, [`hide`, `pick`, `show`, `fingerprint`])
  assert.deepEqual(files.get(selected[0].id), { path: `clip.mp4`, kind: `video` })
  files.release([selected[0].id])
  assert.equal(files.get(selected[0].id), undefined)
})

test(`cancel and picker failure both restore the overlay`, async () => {
  for (const fail of [false, true]) {
    const calls: string[] = []
    const files = new EvidenceFileSelection({
      overlay: { hide: () => { calls.push(`hide`) }, show: () => { calls.push(`show`) } },
      pick: async () => {
        if (fail) throw new Error(`picker failed`)
        return { canceled: true, filePaths: [] }
      }
    })
    if (fail) await assert.rejects(files.select(), /picker failed/u)
    else assert.deepEqual(await files.select(), [])
    assert.deepEqual(calls, [`hide`, `show`])
  }
})
