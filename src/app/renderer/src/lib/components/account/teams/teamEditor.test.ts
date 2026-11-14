import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { CoreCallResult } from '$lib/core'
import { createTeamEditor } from './teamEditor'

const response = (data: unknown, status = 200) => ({ ok: status === 200, status, data }) as CoreCallResult

test(`saving advances the baseline and a conflict preserves the draft`, async () => {
  let stored = { revision: 0, content: `original` }
  const editor = createTeamEditor<typeof stored>(async () => response(stored), async value => {
    if (value.revision !== stored.revision) return response(null, 409)
    stored = { ...value, revision: value.revision + 1 }
    return response(stored)
  })
  await editor.load()
  editor.change({ content: `first edit` })
  assert.equal(editor.dirty(), true)
  assert.equal(await editor.save(), true)
  assert.equal(editor.dirty(), false)
  stored = { revision: 2, content: `another editor` }
  editor.change({ content: `my draft` })
  assert.equal(await editor.save(), false)
  assert.equal(get(editor).value?.content, `my draft`)
  assert.equal(editor.dirty(), true)
  assert.equal(stored.content, `another editor`)
})

test(`a disposed editor ignores late loads`, async () => {
  let release!: (value: CoreCallResult) => void
  const editor = createTeamEditor(async () => new Promise<CoreCallResult>(resolve => { release = resolve }), async () => response(null))
  const loading = editor.load()
  editor.dispose()
  release(response({ revision: 1 }))
  await loading
  assert.equal(get(editor).value, null)
})
