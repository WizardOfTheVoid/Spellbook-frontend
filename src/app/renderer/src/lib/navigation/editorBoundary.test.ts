import assert from 'node:assert/strict'
import test from 'node:test'
import { editorBoundary } from './editorBoundary'
import { createNavigationHistory } from './navigationHistory'

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
