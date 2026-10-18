import assert from 'node:assert/strict'
import test from 'node:test'
import { parseCommandProvenance, commandProvenanceDetails, stripCommandProvenance } from './commandProvenanceView'

const occurrences = [{ id: `observation`, actorId: 7, origin: `external`, command: `KickById ABCD original`, observedAtUtc: `2026-10-16T10:00:00.000Z` }]

test(`private occurrence parsing preserves identity, actor, command and timestamp`, () => {
  assert.deepEqual(parseCommandProvenance(occurrences), occurrences)
  for (const value of [null, [{ ...occurrences[0], actorId: -1 }], [{ ...occurrences[0], origin: `local` }],
    [{ ...occurrences[0], observedAtUtc: `bad` }], [{ ...occurrences[0], command: null }]]) {
    assert.throws(() => parseCommandProvenance(value))
  }
})

test(`role loss clears private data and leaves normal action data intact`, () => {
  const action = { id: 9, reason: `original`, commandProvenance: parseCommandProvenance(occurrences) }
  assert.deepEqual(stripCommandProvenance(action), { id: 9, reason: `original` })
  assert.deepEqual(commandProvenanceDetails(action.commandProvenance, false), [])
  const details = commandProvenanceDetails(action.commandProvenance, true)
  assert.ok(details.some(detail => detail.value === occurrences[0].command))
  assert.ok(details.some(detail => detail.value === occurrences[0].observedAtUtc && detail.format === `dateTime`))
})
