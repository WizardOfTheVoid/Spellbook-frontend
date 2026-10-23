import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerOffenseType, ServerProfileCommand } from '$lib/core'
import { findOffenseTypeMismatches } from './offenseTypeCheck'

function draft(offenseType: PlayerOffenseType = `griefing`, message = ``) {
  const command: ServerProfileCommand = { commandType: `ban`, offenseType, message, sortOrder: 0, delayMs: 0 }
  const action = { label: `Moderation`, description: null as string | null, commands: [command] }
  return { action, command }
}

test(`detects a different offense in the current message and clears after correcting the selection`, () => {
  const { action, command } = draft(`griefing`, `Please stop RDM`)
  assert.deepEqual(findOffenseTypeMismatches(action, command), [`ffa`])
  command.offenseType = `ffa`
  assert.deepEqual(findOffenseTypeMismatches(action, command), [])
  command.message = `Stop cheating`
  assert.deepEqual(findOffenseTypeMismatches(action, command), [`hacker`])
})

test(`checks the action name, description and sibling command messages`, () => {
  for (const example of [
    { label: `Kick for cheating`, expected: `hacker` },
    { description: `No low-level players`, expected: `low_level` },
    { message: `Stop vote-kick abuse`, expected: `votekick_abuse` }
  ]) {
    const { action, command } = draft()
    action.label = example.label ?? action.label
    action.description = example.description ?? null
    action.commands.push({ commandType: `server_message`, message: example.message ?? ``, sortOrder: 1, delayMs: 0 })
    assert.deepEqual(findOffenseTypeMismatches(action, command), [example.expected])
  }
})

test(`recognizes offense aliases regardless of case, spacing, hyphens and underscores`, () => {
  for (const [message, offenseType] of [
    [`SpeEd-Hack`, `hacker`],
    [`FREE_for-ALL`, `ffa`],
    [`VERBAL_ABUSE`, `verbal_abuse`],
    [`TEAM-KILLING`, `griefing`],
    [`BUG_ABUSE`, `exploiting`],
    [`TOXIC_BEHAVIOUR`, `toxic_behavior`],
    [`LOW—LEVEL`, `low_level`],
    [`FALSE   VOTE_KICK`, `votekick_abuse`]
  ]) {
    const { action, command } = draft(`other`, message)
    assert.deepEqual(findOffenseTypeMismatches(action, command), [offenseType])
  }
})

test(`matches whole words without treating fragments of other words as offenses`, () => {
  const { action, command } = draft(`other`, `scoffable RDMusic exploitative toxicology grieferino`)
  assert.deepEqual(findOffenseTypeMismatches(action, command), [])
})

test(`does not assemble offense phrases across separate fields or commands`, () => {
  const { action, command } = draft(`other`, `level`)
  action.label = `Free for`
  action.description = `all`
  action.commands.push({ commandType: `server_message`, message: `low`, sortOrder: 1, delayMs: 0 })
  assert.deepEqual(findOffenseTypeMismatches(action, command), [])
})

test(`checks only moderation commands with a selected offense`, () => {
  const { action, command } = draft(`other`, `FFA`)
  for (const commandType of [`ban`, `kick`, `warn`, `incremental_ban`] as const) {
    command.commandType = commandType
    assert.deepEqual(findOffenseTypeMismatches(action, command), [`ffa`])
  }
  for (const commandType of [`server_message`, `admin_message`, `unban`] as const) {
    command.commandType = commandType
    assert.deepEqual(findOffenseTypeMismatches(action, command), [])
  }
  command.commandType = `ban`
  command.offenseType = null
  assert.deepEqual(findOffenseTypeMismatches(action, command), [])
  assert.deepEqual(findOffenseTypeMismatches(null, command), [])
  assert.deepEqual(findOffenseTypeMismatches(action, null), [])
})

test(`reports each differing offense once without changing the action or command`, () => {
  const { action, command } = draft(`ffa`, `griefing hacker FFA`)
  action.label = `Hacker FFA`
  action.description = `Griefer griefing`
  const original = structuredClone({ action, command })
  assert.deepEqual(findOffenseTypeMismatches(action, command), [`hacker`, `griefing`])
  assert.deepEqual({ action, command }, original)
})

test(`does not infer an offense from generic words or the Other category`, () => {
  const { action, command } = draft(`ffa`, `Other reason: kick abuse at any level`)
  assert.deepEqual(findOffenseTypeMismatches(action, command), [])
})
