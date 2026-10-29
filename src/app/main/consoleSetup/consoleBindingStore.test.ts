import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { ConsoleBindingStore } from './consoleBindingStore'

const binding = { key: `Minus`, layoutId: `00000414`, checkedAt: `2026-10-22T13:01:00.000Z` } as const
async function fixture() {
  const root = resolve(`../.artifacts/tmp/consoleKeyboardLayouts/stores`)
  await mkdir(root, { recursive: true })
  return join(await mkdtemp(join(root, `store-`)), `verification.json`)
}

test(`legacyPassDoesNotSupplyLayout`, async () => {
  const path = await fixture()
  const legacy = { version: 1, verifiedKeys: [`Minus`] }
  await writeFile(path, JSON.stringify(legacy))
  const store = new ConsoleBindingStore(path)
  await store.load()
  assert.equal(store.get(`Minus`), null)
  assert.equal(store.getOverride(`Minus`), null)
  assert.deepEqual(JSON.parse(await readFile(path, `utf8`)), legacy)
})

test(`version2BindingAndOverrideSurviveRestart`, async () => {
  const path = await fixture()
  const first = new ConsoleBindingStore(path)
  await first.markPassed(binding)
  await first.setOverride(`Minus`, `00000409`)
  const next = new ConsoleBindingStore(path)
  await next.load()
  assert.deepEqual(next.get(`Minus`), binding)
  assert.equal(next.getOverride(`Minus`), `00000409`)
  await next.clearOverride(`Minus`)
  assert.deepEqual(next.get(`Minus`), binding)
  assert.equal(next.getOverride(`Minus`), null)
  await next.revoke(`Minus`)
  const revoked = new ConsoleBindingStore(path)
  await revoked.load()
  assert.equal(revoked.get(`Minus`), null)
})

test(`sameKeyRevokeRequiresFreshVerification`, async () => {
  const store = new ConsoleBindingStore()
  await store.markPassed(binding)
  await store.revoke(`Minus`)
  assert.equal(store.get(`Minus`), null)
})

test(`overrideCannotCompleteInitialSetup`, async () => {
  const store = new ConsoleBindingStore()
  await assert.rejects(store.setOverride(`Minus`, `00000409`))
  assert.equal(store.get(`Minus`), null)
})

test(`checkClearsOverrideWithoutInventingPass`, async () => {
  const store = new ConsoleBindingStore()
  await store.markPassed(binding)
  await store.setOverride(`Minus`, `00000409`)
  await store.clearOverride(`Minus`)
  assert.equal(store.getOverride(`Minus`), null)
  assert.deepEqual(store.get(`Minus`), binding)
})

test(`failedWriteDoesNotPublishSuccess`, async () => {
  const parentFile = await fixture()
  await writeFile(parentFile, `occupied`)
  const store = new ConsoleBindingStore(join(parentFile, `record.json`))
  await assert.rejects(store.markPassed(binding))
  assert.equal(store.get(`Minus`), null)
})

test(`malformed and duplicate records fail closed`, async () => {
  for (const bindings of [[binding, binding], [{ ...binding, layoutId: `00000000` }], [{ ...binding, checkedAt: `yesterday` }]]) {
    const path = await fixture()
    await writeFile(path, JSON.stringify({ version: 2, bindings, overrides: [] }))
    const store = new ConsoleBindingStore(path)
    await assert.rejects(store.load())
    assert.equal(store.get(`Minus`), null)
  }
})
