import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createTagTypesStore } from './tagTypesStore'
import { defaultTagDefinitions } from '@spellbook/shared/actions/tagTypeDefinitions.js'

test(`saved wording survives an older catalog read completing later`, async () => {
  let resolve!: (rows: typeof defaultTagDefinitions[number][]) => void
  const promise = new Promise<typeof defaultTagDefinitions[number][]>(done => { resolve = done })
  const store = createTagTypesStore(async () => promise, async row => ({ ...row, revision: row.revision + 1 }))
  const pending = store.load()
  const row = defaultTagDefinitions.find(row => row.group === `action` && row.slug === `ban`)!
  await store.save({ ...row, pastTense: `excluded` })
  resolve([...defaultTagDefinitions])
  await pending
  assert.equal(get(store).find(row => row.group === `action` && row.slug === `ban`)?.pastTense, `excluded`)
})

test(`failed reads preserve the current catalog and permit retry`, async () => {
  let fail = true
  const store = createTagTypesStore(async () => {
    if (fail) throw new Error(`Unavailable`)
    return defaultTagDefinitions.map(row => row.slug === `admin` ? { ...row, name: `Moderator` } : row)
  }, async row => row)
  await assert.rejects(store.load(), /Unavailable/u)
  fail = false
  await store.load()
  assert.equal(get(store).find(row => row.slug === `admin`)?.name, `Moderator`)
})
