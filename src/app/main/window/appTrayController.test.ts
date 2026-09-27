import assert from 'node:assert/strict'
import test from 'node:test'
import type { Menu, MenuItemConstructorOptions, Tray } from 'electron'
import { productVersion } from '@spellbook/shared/productVersion'
import { AppTrayController } from './appTrayController'

type TrayFixture = {
  tray: Tray
  destroyCalls: () => number
  tooltip: () => string | undefined
  menu: () => Menu | undefined
  leftClick: () => void
}

function createTrayFixture(setup?: { setContextMenu?: () => void, destroy?: () => void }): TrayFixture {
  let destroyCalls = 0
  let tooltip: string | undefined
  let menu: Menu | undefined
  let clickListener: (() => void) | undefined
  const tray = {
    on: (event: string, listener: () => void) => {
      if (event === `click`) clickListener = listener
      return tray
    },
    setToolTip: (value: string) => { tooltip = value },
    setContextMenu: (value: Menu) => {
      setup?.setContextMenu?.()
      menu = value
    },
    destroy: () => {
      destroyCalls += 1
      setup?.destroy?.()
    }
  } as unknown as Tray

  return {
    tray,
    destroyCalls: () => destroyCalls,
    tooltip: () => tooltip,
    menu: () => menu,
    leftClick: () => clickListener?.()
  }
}

function createController(options: {
  trays?: TrayFixture[]
  onToggle?: () => void
  onNavigate?: (destination: `account` | `settings` | `teams` | `help`) => void
  onError?: (error: unknown) => void
  buildMenu?: (template: MenuItemConstructorOptions[]) => Menu
  appName?: string
} = {}) {
  let trayIndex = 0
  let buildMenuCalls = 0
  const iconPaths: string[] = []
  const template: MenuItemConstructorOptions[] = []
  const controller = new AppTrayController({
    appName: options.appName ?? `SpellBook`,
    iconPath: `C:\\SpellBook\\icon.ico`,
    getVersion: () => productVersion,
    createTray: iconPath => {
      iconPaths.push(iconPath)
      return options.trays?.[trayIndex++].tray as Tray
    },
    buildMenu: value => {
      buildMenuCalls += 1
      template.splice(0, template.length, ...value)
      return options.buildMenu?.(value) ?? {} as Menu
    },
    onToggle: options.onToggle ?? (() => undefined),
    onNavigate: options.onNavigate ?? (() => undefined),
    onError: options.onError ?? (() => undefined)
  })

  return { controller, iconPaths, template, buildMenuCalls: () => buildMenuCalls }
}

test(`initialization uses the injected app name for its header and tooltip`, () => {
  const fixture = createTrayFixture()
  const { controller, iconPaths, template } = createController({
    appName: `Arcana Console`,
    trays: [fixture]
  })

  controller.initialize()

  assert.equal(fixture.tooltip(), `Arcana Console`)
  assert.ok(fixture.menu())
  assert.deepEqual(iconPaths, [`C:\\SpellBook\\icon.ico`])
  assert.deepEqual(template.map(item => ({ label: item.label, type: item.type, enabled: item.enabled })), [
    { label: `Arcana Console ${productVersion}`, type: undefined, enabled: false },
    { label: undefined, type: `separator`, enabled: undefined },
    { label: `Profile`, type: undefined, enabled: undefined },
    { label: `Settings`, type: undefined, enabled: undefined },
    { label: `My teams`, type: undefined, enabled: undefined },
    { label: `Help`, type: undefined, enabled: undefined },
    { label: undefined, type: `separator`, enabled: undefined },
    { label: `Toggle (F3)`, type: undefined, enabled: undefined },
    { label: `Quit`, type: undefined, enabled: undefined }
  ])
})

test(`menu callbacks navigate to the requested destinations and toggle once`, () => {
  const fixture = createTrayFixture()
  let toggles = 0
  const destinations: string[] = []
  const { controller, template } = createController({
    trays: [fixture],
    onToggle: () => { toggles += 1 },
    onNavigate: destination => { destinations.push(destination) }
  })

  controller.initialize()
  for (const label of [`Profile`, `Settings`, `My teams`, `Help`, `Toggle (F3)`]) {
    const item = template.find(item => item.label === label)
    assert.ok(item?.click)
    item.click(undefined as never, undefined as never, undefined as never)
  }

  assert.equal(toggles, 1)
  assert.deepEqual(destinations, [`account`, `settings`, `teams`, `help`])
})

test(`left clicking the tray delegates to the existing overlay toggle`, () => {
  const fixture = createTrayFixture()
  let toggled = false
  const { controller } = createController({
    trays: [fixture],
    onToggle: () => { toggled = true }
  })

  controller.initialize()
  fixture.leftClick()

  assert.equal(toggled, true)
})

test(`tray shortcut label follows settings before initialization and after changes`, () => {
  const fixture = createTrayFixture()
  const { controller, template } = createController({ trays: [fixture] })
  controller.refresh(`F6`)
  controller.initialize()
  assert.ok(template.some(item => item.label === `Toggle (F6)`))
  controller.refresh(`F7`)
  assert.ok(template.some(item => item.label === `Toggle (F7)`))
  assert.equal(fixture.destroyCalls(), 0)
})

test(`repeated initialization retains one tray and menu`, () => {
  const first = createTrayFixture()
  const second = createTrayFixture()
  const { controller, buildMenuCalls } = createController({ trays: [first, second] })

  controller.initialize()
  controller.initialize()

  assert.equal(first.tooltip(), `SpellBook`)
  assert.equal(buildMenuCalls(), 1)
  assert.equal(second.tooltip(), undefined)
})

test(`cleanup destroys once and permits later tray recreation`, () => {
  const first = createTrayFixture()
  const second = createTrayFixture()
  const { controller } = createController({ trays: [first, second] })

  controller.initialize()
  controller.cleanup()
  controller.cleanup()
  controller.initialize()

  assert.equal(first.destroyCalls(), 1)
  assert.equal(second.tooltip(), `SpellBook`)
})

test(`failed setup destroys the partial tray, reports it, and allows retry`, () => {
  const failure = new Error(`context menu failed`)
  const partial = createTrayFixture({ setContextMenu: () => { throw failure } })
  const retry = createTrayFixture()
  const errors: unknown[] = []
  const { controller } = createController({
    trays: [partial, retry],
    onError: error => errors.push(error)
  })

  assert.doesNotThrow(() => controller.initialize())
  controller.initialize()

  assert.equal(partial.destroyCalls(), 1)
  assert.deepEqual(errors, [failure])
  assert.equal(retry.tooltip(), `SpellBook`)
})

test(`failed setup remains retryable when partial tray destruction throws`, () => {
  const failure = new Error(`context menu failed`)
  const partial = createTrayFixture({
    setContextMenu: () => { throw failure },
    destroy: () => { throw new Error(`tray destruction failed`) }
  })
  const retry = createTrayFixture()
  const errors: unknown[] = []
  const { controller } = createController({
    trays: [partial, retry],
    onError: error => errors.push(error)
  })

  assert.doesNotThrow(() => controller.initialize())
  controller.initialize()

  assert.equal(partial.destroyCalls(), 1)
  assert.deepEqual(errors, [failure])
  assert.equal(retry.tooltip(), `SpellBook`)
})

test(`failed setup remains retryable when reporting throws`, () => {
  const failure = new Error(`context menu failed`)
  const partial = createTrayFixture({ setContextMenu: () => { throw failure } })
  const retry = createTrayFixture()
  const reported: unknown[] = []
  const { controller } = createController({
    trays: [partial, retry],
    onError: error => {
      reported.push(error)
      throw new Error(`reporting failed`)
    }
  })

  assert.doesNotThrow(() => controller.initialize())
  controller.initialize()

  assert.equal(partial.destroyCalls(), 1)
  assert.deepEqual(reported, [failure])
  assert.equal(retry.tooltip(), `SpellBook`)
})
