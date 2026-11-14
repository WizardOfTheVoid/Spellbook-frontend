import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuditLogRecord } from '../../../core'

test(`activity presentation preserves recorded outcomes without exposing metadata`, async () => {
  const module = await import(`./userActivityPresentation`).catch(() => ({}))
  const present = Reflect.get(module, `userActivityPresentation`)
  assert.equal(typeof present, `function`)
  const input = { eventType: `player_action.created`, outcome: `submitted`, targetType: `player`, targetId: `42`,
    createdAt: `2026-10-29T00:00:00Z`, meta: { command: `private command` } } as unknown as AuditLogRecord
  assert.deepEqual(present(input), { description: `Created a player action`, target: `Player #42`, outcome: `Submitted`, createdAt: input.createdAt })
  assert.deepEqual(present({ ...input, eventType: `new.kind`, outcome: `success` }),
    { description: `Recorded activity`, target: `Player #42`, outcome: `Recorded`, createdAt: input.createdAt })
})
