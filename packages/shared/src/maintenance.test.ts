import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateMaintenanceInput, maintenanceMessage } from './maintenance.js'

test(`maintenance validates Unicode code points and preserves literal multiline copy`, () => {
  const input = { enabled: true, title: `😀`.repeat(120), text: `<script>\nHello` }
  assert.deepEqual(validateMaintenanceInput(input), input)
  assert.equal(maintenanceMessage(input), `${input.title}\n\n${input.text}`)
  for (const invalid of [{ ...input, enabled: `true` }, { ...input, title: ` ` }, { ...input, title: `😀`.repeat(121) }, { ...input, text: `😀`.repeat(2001) }]) {
    assert.throws(() => validateMaintenanceInput(invalid))
  }
})
