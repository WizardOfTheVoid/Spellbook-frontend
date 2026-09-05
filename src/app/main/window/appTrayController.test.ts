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
  onExit?: () => void
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
    onExit: options.onExit ?? (() => undefined),
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
    { label: `Toggle`, type: undefined, enabled: undefined },
    { label: undefined, type: `separator`, enabled: undefined },
    { label: `Exit`, type: undefined, enabled: undefined }
  ])
})

test(`menu callbacks delegate Toggle and Exit once`, () => {
  const fixture = createTrayFixture()
  let toggles = 0
  let exits = 0
  const { controller, template } = createController({
    trays: [fixture],
    onToggle: () => { toggles += 1 },
    onExit: () => { exits += 1 }
  })

  controller.initialize()
  template[2].click?.(undefined as never, undefined as never, undefined as never)
  template[4].click?.(undefined as never, undefined as never, undefined as never)

  assert.equal(toggles, 1)
  assert.equal(exits, 1)
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
