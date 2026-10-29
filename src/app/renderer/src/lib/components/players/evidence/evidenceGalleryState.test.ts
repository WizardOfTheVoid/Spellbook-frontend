import assert from 'node:assert/strict'
import test from 'node:test'
import { getEvidenceGalleryCount } from './evidenceGalleryState'

test(`a complete gallery response replaces the previous total`, () => {
  assert.equal(getEvidenceGalleryCount(12, 20), 12)
  assert.equal(getEvidenceGalleryCount(0, 12), 0)
  assert.equal(getEvidenceGalleryCount(199, 350), 199)
})

test(`a capped gallery response preserves a larger known total`, () => {
  assert.equal(getEvidenceGalleryCount(200, 350), 350)
  assert.equal(getEvidenceGalleryCount(200, 12), 200)
  assert.equal(getEvidenceGalleryCount(200, null), 200)
})
