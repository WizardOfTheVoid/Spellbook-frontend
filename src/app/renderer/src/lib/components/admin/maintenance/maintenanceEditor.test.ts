import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createMaintenanceEditor } from './maintenanceEditor'

const saved = { enabled: false, title: `Maintenance`, text: `Original`, revision: 1, updatedAt: `2026-10-21`, updatedBy: 1 }

test(`saves literal multiline copy with the displayed revision and retains edits made while saving`, async () => {
  let finish: (value: typeof saved) => void = () => {}
  let sent: unknown
  const editor = createMaintenanceEditor({ admin: async () => saved, update: async input => {
    sent = input
    return await new Promise(resolve => { finish = resolve })
  } })
  await editor.load()
  editor.edit({ title: `<script>`, text: `Line one\n\n**Literal** 😀` })
  const saving = editor.save(true)
  editor.edit({ text: `New unsaved draft` })
  finish({ ...saved, enabled: true, revision: 2 })
  await saving
  assert.deepEqual(sent, { enabled: true, title: `<script>`, text: `Line one\n\n**Literal** 😀`, expectedRevision: 1 })
  assert.equal(get(editor).draft.text, `New unsaved draft`)
  assert.equal(get(editor).saved?.revision, 2)
  assert.equal(editor.dirty(), true)
})

test(`conflicts fetch the authoritative state while preserving the draft until explicit reload`, async () => {
  let latest = saved
  const editor = createMaintenanceEditor({ admin: async () => latest, update: async () => {
    latest = { ...saved, title: `Other admin`, revision: 2 }
    throw Object.assign(new Error(`Changed elsewhere`), { code: `MAINTENANCE_CONFLICT` })
  } })
  await editor.load()
  editor.edit({ title: `My draft` })
  await editor.save()
  assert.equal(get(editor).conflict, true)
  assert.equal(get(editor).draft.title, `My draft`)
  assert.equal(get(editor).saved?.title, `Other admin`)
  await editor.load(true)
  assert.equal(get(editor).draft.title, `Other admin`)
  assert.equal(get(editor).conflict, false)
})

test(`failed saves preserve drafts and shared Unicode validation prevents invalid requests`, async () => {
  let requests = 0
  const editor = createMaintenanceEditor({ admin: async () => saved, update: async () => {
    requests += 1
    throw new Error(`Unavailable`)
  } })
  await editor.load()
  editor.edit({ title: `😀`.repeat(121) })
  await editor.save()
  assert.equal(requests, 0)
  editor.edit({ title: `😀`.repeat(120), text: `Valid\ntext` })
  await editor.save()
  assert.equal(requests, 1)
  assert.equal(get(editor).draft.text, `Valid\ntext`)
  assert.equal(editor.dirty(), true)
})
