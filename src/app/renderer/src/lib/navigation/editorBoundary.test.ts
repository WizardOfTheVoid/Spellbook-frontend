import assert from 'node:assert/strict'
import test from 'node:test'
import { editorBoundary } from './editorBoundary'
import { createNavigationHistory } from './navigationHistory'

test(`history Back checks the navigation guard before restoring a server tab`, async () => {
  let tab = `overview`
  let discard = false
  let prompts = 0
  const history = createNavigationHistory({ canLeave: (from, to) => {
    if (editorBoundary(from) === editorBoundary(to)) return true
    prompts++
    return discard
  } })
  history.register(`app`, () => ({ activePage: `servers` }), () => {})
  history.register(`serverDetail`, () => ({ editingServer: { id: 3 }, selectedPlayer: null }), () => {})
  history.register(`serverTab`, () => tab, value => { tab = value })
  await history.visit(() => { tab = `technical` })
  assert.equal(await history.back(), false)
  assert.equal(tab, `technical`)
  assert.equal(prompts, 1)
  discard = true
  assert.equal(await history.back(), true)
  assert.equal(tab, `overview`)
})

for (const editor of [`guidelines`, `settings`]) {
  test(`history Back protects unsaved team ${editor} before restoring the referrer`, async () => {
    let state = { selectedTeamId: 3, teamView: `members` }
    let discard = false
    let prompts = 0
    const history = createNavigationHistory({ canLeave: (from, to) => {
      if (editorBoundary(from) === editorBoundary(to)) return true
      prompts += 1
      return discard
    } })
    history.register(`app`, () => ({ activePage: `teams` }), () => {})
    history.register(`teamDetail`, () => state, value => { state = value })
    await history.visit(() => { state = { ...state, teamView: editor } })
    assert.equal(await history.pageBack(() => { state = { ...state, teamView: `members` } }), false)
    assert.equal(state.teamView, editor)
    assert.equal(prompts, 1)
    discard = true
    assert.equal(await history.pageBack(() => { state = { ...state, teamView: `members` } }), true)
    assert.equal(state.teamView, `members`)
  })
}

test(`history navigation out of tag definitions asks the unsaved-change guard before discarding`, async () => {
  let view = `definitions`
  let prompts = 0
  const history = createNavigationHistory({ canLeave: (from, to) => {
    if (editorBoundary(from) === editorBoundary(to)) return true
    prompts += 1
    return false
  } })
  history.register(`app`, () => ({ activePage: `admin` }), () => {})
  history.register(`admin`, () => ({ view }), state => { view = state.view })
  await history.visit(() => { view = `tag-types` })
  await history.back()
  assert.equal(prompts, 1)
  assert.equal(view, `tag-types`)
})


test(`history navigation out of rulesets checks for unsaved rule drafts`, async () => {
  let tab = `actions`
  let prompts = 0
  const history = createNavigationHistory({ canLeave: (from, to) => {
    if (editorBoundary(from) === editorBoundary(to)) return true
    prompts += 1
    return false
  } })
  history.register(`app`, () => ({ activePage: `profiles`, selectedProfileId: 1 }), () => {})
  history.register(`profileView`, () => ({ mode: `editing`, tab }), state => { tab = state.tab })
  await history.visit(() => { tab = `rulesets` })
  await history.back()
  assert.equal(prompts, 1)
  assert.equal(tab, `rulesets`)
})
