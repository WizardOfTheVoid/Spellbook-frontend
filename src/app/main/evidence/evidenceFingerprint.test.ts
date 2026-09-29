import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fingerprintEvidenceFile } from './evidenceFingerprint'

test(`selected evidence is hashed from its original bytes`, async () => {
  const directory = await mkdtemp(join(tmpdir(), `spellbook-fingerprint-`))
  try {
    const file = join(directory, `example.png`)
    const bytes = Buffer.from(`original screenshot bytes`)
    await writeFile(file, bytes)
    assert.deepEqual(await fingerprintEvidenceFile(file), {
      size: bytes.length,
      originalSha256: createHash(`sha256`).update(bytes).digest(`hex`)
    })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
