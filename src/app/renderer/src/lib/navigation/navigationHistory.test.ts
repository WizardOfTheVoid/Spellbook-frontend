import assert from 'node:assert/strict'
import test from 'node:test'
import { createNavigationHistory } from './navigationHistory'

function setup() {
  const history = createNavigationHistory()
  let page = `wanted`
  let help: string | null = null
  let search = ``
  history.register(`page`, () => page, value => { page = value })
  history.register(`help`, () => help, value => { help = value })
  history.register(`search`, () => search, value => { search = value }, () => null)
  return { history, page: () => page, help: () => help, search: () => search,
    open: (value: string) => history.visit(() => { page = value }),
    openHelp: (value: string | null) => history.visit(() => { help = value }),
    searchFor: (value: string) => { search = value } }
}

test(`Back and Forward return through the visited player and Notes`, async () => {
  const app = setup()
  await app.open(`wanted:player1`)
  await app.open(`players:player1:notes`)
  await app.history.back()
  assert.equal(app.page(), `wanted:player1`)
  await app.history.back()
  assert.equal(app.page(), `wanted`)
  await app.history.forward()
  await app.history.forward()
  assert.equal(app.page(), `players:player1:notes`)
})

test(`hierarchy fallback remains a backwards move and supports Forward`, async () => {
  const app = setup()
  await app.history.back(() => { app.searchFor(`parent`) })
  assert.equal(app.history.canForward, false)
  await app.history.back(() => app.open(`dashboard`))
  assert.equal(app.page(), `dashboard`)
  assert.equal(app.history.canBack, false)
  await app.history.forward()
  assert.equal(app.page(), `wanted`)
})

test(`a new destination clears Forward and repeated destinations do not add entries`, async () => {
  const app = setup()
  await app.open(`players`)
  await app.open(`players`)
  await app.history.back()
  assert.equal(app.page(), `wanted`)
  await app.open(`teams`)
  assert.equal(app.history.canForward, false)
  await app.history.forward()
  assert.equal(app.page(), `teams`)
})

test(`Help sections restore over the underlying page`, async () => {
  const app = setup()
  await app.openHelp(`debug`)
  await app.openHelp(`onboarding`)
  await app.history.visit(async () => {
    await app.openHelp(null)
    await app.open(`teams`)
  })
  await app.history.back()
  assert.equal(app.page(), `wanted`)
  assert.equal(app.help(), `onboarding`)
  await app.history.back()
  assert.equal(app.help(), `debug`)
  await app.history.back()
  assert.equal(app.help(), null)
})

test(`view state restores without adding steps or retaining mutable snapshots`, async () => {
  const app = setup()
  app.searchFor(`archer`)
  await app.open(`players`)
  app.searchFor(`knight`)
  await app.history.back()
  assert.equal(app.search(), `archer`)
  assert.equal(app.history.canBack, false)
})

test(`late mounting subpages restore from their destination and unregister safely`, async () => {
  const app = setup()
  await app.open(`players`)
  let tab = `notes`
  const stop = app.history.register(`player`, () => tab, value => { tab = value })
  await app.open(`teams`)
  stop()
  await app.history.back()
  tab = `profile`
  app.history.register(`player`, () => tab, value => { tab = value })
  assert.equal(tab, `notes`)
})

test(`cancelling navigation leaves both history directions unchanged`, async () => {
  let allowed = true
  const history = createNavigationHistory({ canLeave: () => allowed })
  let page = `wanted`
  history.register(`page`, () => page, value => { page = value })
  await history.visit(() => { page = `notes` })
  allowed = false
  assert.equal(await history.back(), false)
  assert.equal(page, `notes`)
  assert.equal(history.canBack, true)
  assert.equal(history.canForward, false)
})

test(`reset clears account history`, async () => {
  const app = setup()
  await app.open(`players`)
  app.history.reset()
  assert.equal(app.history.canBack, false)
  assert.equal(app.history.canForward, false)
})

test(`leaving before a subpage mounts preserves its saved destination`, async () => {
  const app = setup()
  await app.open(`players`)
  let tab = `notes`
  const stop = app.history.register(`player`, () => tab, value => { tab = value })
  await app.open(`teams`)
  stop()
  await app.history.back()
  await app.history.back()
  await app.history.forward()
  tab = `profile`
  app.history.register(`player`, () => tab, value => { tab = value })
  assert.equal(tab, `notes`)
})

test(`a late asynchronous restoration cannot reopen a previous destination`, async () => {
  const app = setup()
  let team: number | null = null
  let resume: (() => void) | undefined
  let delayed = true
  const stop = app.history.register(`team`, () => team, value => { team = value })
  await app.history.visit(() => { team = 7 })
  await app.open(`settings`)
  stop()
  await app.history.back()
  team = null
  app.history.register(`team`, () => team, async (value, isCurrent) => {
    if (value !== null && delayed) {
      delayed = false
      await new Promise<void>(resolve => { resume = resolve })
    }
    if (isCurrent()) team = value
  })
  await app.history.back()
  resume?.()
  await Promise.resolve()
  assert.equal(team, null)
  await app.history.forward()
  assert.equal(team, 7)
})
