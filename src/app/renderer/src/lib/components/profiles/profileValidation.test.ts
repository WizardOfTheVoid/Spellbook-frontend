import assert from 'node:assert/strict'
import test from 'node:test'
import { draftNumber, newAction, newCommand, type ProfileDraft } from './profileDraft'
import { incrementalBanFieldErrors, profileErrors } from './profileValidation'

const profile = (): ProfileDraft => ({ profile: { id: 1, owner: { type: `user`, id: 1 }, name: `Rules`, isDefault: false },
  servers: [], availableVariables: [], actions: [{ ...newAction(`Warn`, 0), actionDomain: `player`,
    commands: [{ ...newCommand(0), commandType: `warn`, offenseType: `other` }] }] })

test(`new drafts require deliberate domain and command selections with zero delay`, () => {
  const action = newAction(`New`, 0)
  assert.equal(action.actionDomain, ``)
  assert.equal(action.commands[0].commandType, ``)
  assert.equal(action.commands[0].offenseType, null)
  assert.equal(action.commands[0].delayMs, 0)
})

test(`validation distinguishes cleared numbers from zero and rejects invalid delays`, () => {
  const draft = profile()
  assert.equal(draftNumber(``), ``)
  assert.equal(draftNumber(`0`), 0)
  assert.deepEqual(profileErrors(draft), [])
  for (const value of [``, -1, 0.5, NaN, Infinity] as const) {
    draft.actions[0].commands[0].delayMs = value
    assert.ok(profileErrors(draft).some(error => error.field === `delayMs` && error.commandIndex === 0))
  }
})

test(`all required fields are reported with current action and command locations`, () => {
  const draft = profile()
  draft.profile.name = ` `
  draft.actions.push(newAction(``, 1))
  draft.actions[1].commands[0].message = ``
  const errors = profileErrors(draft)
  assert.equal(errors[0].field, `name`)
  assert.deepEqual(errors.filter(error => error.actionIndex === 1).map(error => error.field),
    [`label`, `actionDomain`, `commandType`, `message`])
  draft.actions.reverse()
  assert.equal(profileErrors(draft).find(error => error.field === `actionDomain`)?.actionIndex, 0)
  draft.actions.shift()
  draft.profile.name = `Rules`
  assert.deepEqual(profileErrors(draft), [])
})

test(`conditional command requirements follow the selected type and domain`, () => {
  const draft = profile()
  const command = draft.actions[0].commands[0]
  for (const type of [`server_message`, `admin_message`, `unban`] as const) {
    command.commandType = type
    command.offenseType = null
    assert.deepEqual(profileErrors(draft), [])
  }
  for (const type of [`warn`, `kick`, `ban`, `incremental_ban`] as const) {
    command.commandType = type
    assert.ok(profileErrors(draft).some(error => error.field === `offenseType`))
  }
  command.commandType = `ban`
  command.offenseType = `other`
  command.durationHours = 0
  assert.ok(profileErrors(draft).some(error => error.field === `durationHours`))
  command.durationHours = 24
  assert.deepEqual(profileErrors(draft), [])
  draft.actions[0].actionDomain = `server`
  assert.ok(profileErrors(draft).some(error => error.field === `commandType`))
})

test(`incremental field errors identify missing filters, invalid and duplicate stages`, () => {
  const config = { windowDays: null, offenseTypes: [] as string[],
    stages: [{ banCount: 2, durationHours: 0 }, { banCount: 2, durationHours: 24 }] }
  const errors = incrementalBanFieldErrors(config)
  for (const key of [`offenseTypes`, `0.banCount`, `0.durationHours`, `1.banCount`]) assert.ok(errors[key])
  config.offenseTypes = [`other`]
  config.stages = [{ banCount: 1, durationHours: 24 }]
  assert.ok(Object.values(incrementalBanFieldErrors(config)).every(error => !error))
})
