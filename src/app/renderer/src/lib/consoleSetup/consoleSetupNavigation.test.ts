import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSetupView } from './consoleSetupNavigation'

const ready = { authenticated: true, profileRequired: false, operational: true, setupLoaded: true, setupRequired: false }
test(`missing console metadata opens required setup and prevents normal operation until loaded`, () => {
  assert.equal(resolveSetupView({ ...ready, setupRequired: true }), `consoleSetup`)
  assert.equal(resolveSetupView({ ...ready, setupLoaded: false }), `loading`)
  assert.equal(resolveSetupView(ready), `existing`)
})
test(`authentication maintenance and account setup retain precedence`, () => {
  for (const input of [{ authenticated: false }, { operational: false }, { profileRequired: true }])
    assert.equal(resolveSetupView({ ...ready, setupRequired: true, ...input }), `existing`)
})

test(`an open setup modal remains visible after verification until Continue`, () => {
  assert.equal(resolveSetupView({ ...ready, modalOpen: true }), `consoleSetup`)
  assert.equal(resolveSetupView({ ...ready, modalOpen: false }), `existing`)
  for (const input of [{ authenticated: false }, { operational: false }, { profileRequired: true }])
    assert.equal(resolveSetupView({ ...ready, modalOpen: true, ...input }), `existing`)
})

test(`changing an unverified key in Settings keeps verification inline until the user leaves`, () => {
  const editing = { ...ready, setupRequired: true, settingsOpen: true }
  assert.equal(resolveSetupView(editing), `existing`)
  assert.equal(resolveSetupView({ ...editing, settingsOpen: false }), `consoleSetup`)
  assert.equal(resolveSetupView({ ...editing, setupRequired: false }), `existing`)
})

test(`startup still requires loaded verified setup outside an already open Settings page`, () => {
  assert.equal(resolveSetupView({ ...ready, setupRequired: true }), `consoleSetup`)
  assert.equal(resolveSetupView({ ...ready, setupRequired: true, setupLoaded: false, settingsOpen: true }), `loading`)
  for (const input of [{ authenticated: false }, { operational: false }, { profileRequired: true }])
    assert.equal(resolveSetupView({ ...ready, setupRequired: true, settingsOpen: true, ...input }), `existing`)
})
