import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { ConsoleVerificationStore } from './consoleVerificationStore'

test(`verified keys survive a new store instance and a revoked key does not`, async () => {
  const directory = await mkdtemp(join(tmpdir(), `spellbook-console-verification-`))
  const path = join(directory, `console-verification.json`)
  try {
    const first = new ConsoleVerificationStore(path)
    await first.load()
    first.markPassed(`NumpadSubtract`)
    first.markPassed(`Backquote`)
    await first.flush()
    const restarted = new ConsoleVerificationStore(path)
    await restarted.load()
    assert.equal(restarted.has(`NumpadSubtract`), true)
    assert.equal(restarted.has(`Backquote`), true)
    restarted.revoke(`NumpadSubtract`)
    await restarted.flush()
    const afterRevoke = new ConsoleVerificationStore(path)
    await afterRevoke.load()
    assert.equal(afterRevoke.has(`NumpadSubtract`), false)
    assert.equal(afterRevoke.has(`Backquote`), true)
    assert.deepEqual(JSON.parse(await readFile(path, `utf8`)), { version: 1, verifiedKeys: [`Backquote`] })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test(`failed reload clears any previously trusted keys`, async () => {
  const directory = await mkdtemp(join(tmpdir(), `spellbook-console-reload-`))
  const path = join(directory, `console-verification.json`)
  try {
    const store = new ConsoleVerificationStore(path)
    store.markPassed(`NumpadSubtract`)
    await store.flush()
    await writeFile(path, `{broken`)
    await assert.rejects(store.load())
    assert.equal(store.has(`NumpadSubtract`), false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
