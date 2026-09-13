import assert from 'node:assert/strict'
import test from 'node:test'
import type { ServerProfileAction } from '$lib/core'
import { profileActionIcon, profileActionIconColor } from './profileActions'

test(`maps every allowlisted icon and falls back for unknown runtime data`, () => {
  const expected = new Map([
    [`ban`, [`fa-ban`, `light`]],
    [`gavel`, [`fa-gavel`, `light`]],
    [`triangle-exclamation`, [`fa-triangle-exclamation`, `light`]],
    [`bullhorn`, [`fa-bullhorn`, `light`]],
    [`discord`, [`fa-discord`, `brands`]],
    [`circle-info`, [`fa-circle-info`, `light`]],
    [`circle-question`, [`fa-circle-question`, `light`]],
    [`gamepad`, [`fa-gamepad`, `light`]]
  ])
  for (const [key, [name, type]] of expected) {
    assert.deepEqual(profileActionIcon({ iconKey: key } as ServerProfileAction), { name, type })
  }
  assert.deepEqual(profileActionIcon({ iconKey: `unknown` } as unknown as ServerProfileAction), {
    name: `fa-circle-info`, type: `light`
  })
})

test(`colors action icons from nested commands with ban priority`, () => {
  assert.equal(profileActionIconColor(action([`kick`, `ban`])), `#ff6157`)
  assert.equal(profileActionIconColor(action([`kick`])), `var(--color-accent-tertiary)`)
  assert.equal(profileActionIconColor(action([`warn`])), `var(--color-light-primary)`)
  assert.equal(profileActionIconColor(action([`server_message`])), `var(--color-light-primary)`)
})

function action(types: ServerProfileAction[`commands`][number][`commandType`][]): ServerProfileAction {
  return {
    label: `Action`, actionDomain: `player`, delayMs: 0, sortOrder: 0, isEnabled: true,
    iconKey: `circle-info`, blockOnMissingVariables: false,
    commands: types.map((commandType, sortOrder) => ({ commandType, sortOrder, delayMs: 0, message: `` }))
  }
}
