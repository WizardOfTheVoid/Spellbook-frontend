import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { AppUpdateService, type AppUpdateEngine } from './appUpdateService'
import { RuntimeQuitGuard } from '../services/runtimeQuitGuard'

class Engine extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = true
  allowPrerelease = true
  allowDowngrade = true
  disableWebInstaller = false
  checks = 0
  installs: unknown[][] = []
  version = `3.5.1`
  forceUpdate = false
  lookup: () => Promise<{
    updateInfo: {
      version: string
      forceUpdate?: unknown
    }
    downloadPromise?: Promise<string[]>
  }> = async () => {
    this.emit(`update-available`, { version: this.version, forceUpdate: this.forceUpdate })
    return {
      updateInfo: { version: this.version, forceUpdate: this.forceUpdate },
      downloadPromise: Promise.resolve([]),
    }
  }
  async checkForUpdates() {
    this.checks += 1
    return this.lookup()
  }
  quitAndInstall(...args: unknown[]) {
    this.installs.push(args)
  }
}

function deferred<T>() {
  return Promise.withResolvers<T>()
}
const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve))
}

function fixture(
  options: {
    prepare?: () => Promise<void>
    restart?: () => Promise<void>
    requireUpdate?: () => Promise<void>
    enabled?: boolean
    now?: () => number
  } = {},
) {
  const engine = new Engine()
  let required = 0
  const opened: string[] = []
  const errors: unknown[] = []
  const service = new AppUpdateService({
    currentVersion: `3.5.0`,
    updater: options.enabled === false ? null : (engine as unknown as AppUpdateEngine),
    openExternal: async (url) => {
      opened.push(url)
    },
    requireUpdate:
      options.requireUpdate ??
      (async () => {
        required += 1
      }),
    prepareToQuit: options.prepare ?? (async () => undefined),
    restartApplication: options.restart ?? (async () => undefined),
    onError: (error) => errors.push(error),
    now: options.now,
  })
  return { engine, service, opened, errors, required: () => required }
}

test(`configures the stable unsigned library policy and canonical manual fallback`, async () => {
  const { engine, service, opened } = fixture()
  assert.equal(engine.autoDownload, true)
  assert.equal(engine.autoInstallOnAppQuit, false)
  assert.equal(engine.allowPrerelease, false)
  assert.equal(engine.allowDowngrade, false)
  assert.equal(engine.disableWebInstaller, true)
  await service.openLatestRelease()
  assert.deepEqual(opened, [`https://chivalry2.dev/download`])
  service.stop()
})

test(`one Main timer checks immediately and every ten minutes, independent of subscribers`, async (t) => {
  t.mock.timers.enable({ apis: [`setInterval`, `setTimeout`] })
  const { service, engine } = fixture()
  service.start()
  service.start()
  await settle()
  assert.equal(engine.checks, 1)
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  const unsubscribe = service.subscribe(() => undefined)
  unsubscribe()
  t.mock.timers.tick(600_000)
  await settle()
  assert.equal(engine.checks, 2)
  service.stop()
  service.stop()
  t.mock.timers.tick(600_000)
  assert.equal(engine.checks, 2)
  assert.equal(engine.listenerCount(`error`), 0)
})

test(`disabled development updater performs no work`, async () => {
  const { service, engine } = fixture({ enabled: false })
  service.start()
  assert.equal(await service.check(), null)
  assert.equal(engine.checks, 0)
  await service.restartAndInstall()
  assert.equal(engine.installs.length, 0)
  service.stop()
})

test(`startup lookup is bounded to five seconds and coalesces until the underlying job settles`, async (t) => {
  t.mock.timers.enable({ apis: [`setTimeout`] })
  const { service, engine } = fixture()
  const lookup = deferred<any>()
  engine.lookup = () => lookup.promise
  const first = service.check()
  t.mock.timers.tick(5_000)
  assert.equal(await first, null)
  const second = service.check()
  assert.equal(engine.checks, 1)
  engine.emit(`update-available`, { version: `3.6.0`, forceUpdate: true })
  lookup.resolve({ updateInfo: { version: `3.6.0`, forceUpdate: true } })
  assert.equal(await second, `3.6.0`)
  assert.equal(service.getState().required, true)
  service.stop()
})

test(`download survives renderer disconnect and becomes ready only on verified completion`, async () => {
  const { service, engine } = fixture()
  const states: string[] = []
  const unsubscribe = service.subscribe((state) => states.push(state.phase))
  await service.check()
  assert.equal(service.getState().phase, `downloading`)
  engine.emit(`download-progress`, { percent: 43.7 })
  assert.equal(service.getState().percent, 43.7)
  unsubscribe()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  assert.equal(service.getState().phase, `ready`)
  assert.equal(states.at(-1), `downloading`)
  service.stop()
})

test(`a ready patch still discovers a newer explicitly required release and download errors retain that requirement`, async () => {
  const { service, engine, required } = fixture()
  await service.check()
  assert.equal(service.getState().required, false)
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  engine.version = `3.6.0`
  engine.forceUpdate = true
  await service.check()
  assert.equal(service.getState().version, `3.6.0`)
  assert.equal(required(), 1)
  engine.emit(`error`, new Error(`private/path`))
  assert.equal(service.getState().phase, `error`)
  assert.equal(service.getState().required, true)
  assert.doesNotMatch(service.getState().error!, /private/u)
  service.stop()
})

test(`download rejections are observed without requiring an error event`, async () => {
  const { service, engine, errors } = fixture()
  engine.lookup = async () => {
    engine.emit(`update-available`, { version: engine.version, forceUpdate: engine.forceUpdate })
    return {
      updateInfo: { version: engine.version, forceUpdate: engine.forceUpdate },
      downloadPromise: Promise.reject(new Error(`download failed`)),
    }
  }
  await service.check()
  await settle()
  assert.equal(service.getState().phase, `error`)
  assert.equal(errors.length, 1)
  service.stop()
})

test(`checks while downloading do not duplicate work and stale download events cannot ready a newer target`, async () => {
  const { service, engine } = fixture()
  await service.check()
  await service.check()
  assert.equal(engine.checks, 1)
  engine.emit(`update-downloaded`, { version: `3.4.0` })
  assert.equal(service.getState().phase, `downloading`)
  service.stop()
})

test(`installation waits for preparation, deduplicates clicks and requests quiet relaunch`, async () => {
  const prepare = deferred<void>()
  const { service, engine } = fixture({ prepare: () => prepare.promise })
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  const first = service.restartAndInstall()
  const second = service.restartAndInstall()
  assert.equal(engine.installs.length, 0)
  assert.equal(service.getState().restartRequired, true)
  prepare.resolve()
  await Promise.all([first, second])
  assert.deepEqual(engine.installs, [[true, true]])
  service.stop()
})

test(`metadata refresh disables installation until it settles`, async () => {
  const { service, engine } = fixture()
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  const lookup = deferred<any>()
  engine.lookup = () => lookup.promise
  const checking = service.check()
  await service.restartAndInstall()
  assert.equal(engine.installs.length, 0)
  lookup.resolve({ updateInfo: { version: engine.version, forceUpdate: engine.forceUpdate } })
  await checking
  assert.notEqual(service.getState().phase, `ready`)
  service.stop()
})

test(`timed out shutdown never installs late and can only recover by restarting`, async (t) => {
  t.mock.timers.enable({ apis: [`setTimeout`] })
  const prepare = deferred<void>()
  let restarts = 0
  const { service, engine } = fixture({
    prepare: () => prepare.promise,
    restart: async () => {
      restarts += 1
    },
  })
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  const installing = service.restartAndInstall()
  t.mock.timers.tick(30_000)
  await installing
  assert.equal(service.getState().phase, `error`)
  assert.equal(service.getState().restartRequired, true)
  prepare.resolve()
  await settle()
  await service.check()
  assert.equal(engine.installs.length, 0)
  assert.equal(engine.checks, 1)
  await service.restartApplication()
  assert.equal(restarts, 1)
  service.stop()
})

test(`preparation rejection and installer errors keep the stopped application in recovery`, async () => {
  const { service, engine } = fixture({
    prepare: async () => {
      throw new Error(`Core still alive`)
    },
  })
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  await service.restartAndInstall()
  assert.equal(engine.installs.length, 0)
  assert.equal(service.getState().restartRequired, true)
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  assert.equal(service.getState().phase, `error`)
  service.stop()
})

test(`ordinary Quit during update preparation exits without installing`, async () => {
  const stopping = deferred<void>()
  let quits = 0
  const guard = new RuntimeQuitGuard(
    async () => stopping.promise,
    () => undefined,
    () => {
      quits += 1
    },
  )
  const { service, engine } = fixture({ prepare: () => guard.prepareToQuit() })
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  const install = service.restartAndInstall()
  guard.handle({ preventDefault: () => undefined })
  stopping.resolve()
  await install
  assert.equal(engine.installs.length, 0)
  assert.equal(quits, 1)
  service.stop()
})

test(`installer launch error is observed after the handoff`, async () => {
  const { service, engine } = fixture()
  engine.quitAndInstall = () => {
    engine.emit(`error`, new Error(`spawn failed`))
  }
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  await service.restartAndInstall()
  assert.equal(service.getState().phase, `error`)
  assert.equal(service.getState().restartRequired, true)
  service.stop()
})

test(`failed metadata refresh retains a known requirement and a retry can finish`, async () => {
  const { service, engine } = fixture()
  engine.version = `3.6.0`
  engine.forceUpdate = true
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  const lookup = engine.lookup
  engine.lookup = async () => {
    throw new Error(`offline`)
  }
  await service.check()
  assert.equal(service.getState().required, true)
  assert.equal(service.getState().phase, `error`)
  engine.lookup = lookup
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
  assert.equal(service.getState().phase, `ready`)
  service.stop()
})

test(`cached verification during a check cannot enable installation until the check settles`, async () => {
  const { service, engine } = fixture()
  const download = deferred<any>()
  engine.lookup = async () => {
    engine.emit(`update-available`, { version: engine.version, forceUpdate: engine.forceUpdate })
    engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
    return download.promise
  }
  const check = service.check()
  await settle()
  assert.equal(service.getState().phase, `downloading`)
  await service.restartAndInstall()
  assert.equal(engine.installs.length, 0)
  download.resolve({ updateInfo: { version: engine.version, forceUpdate: engine.forceUpdate } })
  await check
  assert.equal(service.getState().phase, `ready`)
  service.stop()
})

test(`mandatory logout cannot hold verified downloads or metadata refreshes hostage`, async (t) => {
  t.mock.timers.enable({ apis: [`setTimeout`] })
  const logout = deferred<void>()
  let latched = false
  const { service, engine } = fixture({
    requireUpdate: async () => {
      latched = true
      await logout.promise
    },
  })
  t.after(() => service.stop())
  engine.version = `3.6.0`
  engine.forceUpdate = true
  engine.lookup = async () => {
    engine.emit(`update-available`, { version: engine.version, forceUpdate: engine.forceUpdate })
    engine.emit(`update-downloaded`, { version: engine.version, forceUpdate: engine.forceUpdate })
    return {
      updateInfo: { version: engine.version, forceUpdate: engine.forceUpdate },
      downloadPromise: Promise.resolve([]),
    }
  }
  const checking = service.check()
  await settle()
  assert.equal(latched, true)
  t.mock.timers.tick(5_000)
  await checking
  assert.equal(service.getState().phase, `ready`)
  await service.check()
  assert.equal(engine.checks, 2)
  await service.restartAndInstall()
  assert.equal(engine.installs.length, 1)
  logout.resolve()
})

test(`the release flag can force a patch or leave a minor and major lazy`, async () => {
  for (const [version, forceUpdate] of [
    [`3.5.1`, true],
    [`3.6.0`, false],
    [`4.0.0`, false],
  ] as const) {
    const { service, engine, required } = fixture()
    engine.version = version
    engine.forceUpdate = forceUpdate
    await service.check()
    assert.equal(service.getState().required, forceUpdate)
    assert.equal(required(), forceUpdate ? 1 : 0)
    service.stop()
  }
})

test(`missing or malformed release policy cannot force or install an update`, async () => {
  for (const forceUpdate of [undefined, `false`, 1]) {
    const { service, engine, required } = fixture()
    engine.lookup = async () => {
      engine.emit(`update-available`, { version: engine.version, forceUpdate })
      return { updateInfo: { version: engine.version }, downloadPromise: Promise.resolve([]) }
    }
    await service.check()
    engine.emit(`update-downloaded`, { version: engine.version })
    assert.equal(service.getState().phase, `error`)
    assert.equal(required(), 0)
    await service.restartAndInstall()
    assert.equal(engine.installs.length, 0)
    service.stop()
  }
})

test(`a cached target cannot bypass a failed policy refresh with a late download event`, async () => {
  const { service, engine } = fixture()
  await service.check()
  engine.emit(`update-downloaded`, { version: engine.version })
  engine.lookup = async () => {
    engine.emit(`update-available`, { version: engine.version, forceUpdate: `invalid` })
    engine.emit(`update-downloaded`, { version: engine.version })
    return { updateInfo: { version: engine.version }, downloadPromise: Promise.resolve([]) }
  }
  await service.check()
  assert.equal(service.getState().phase, `error`)
  await service.restartAndInstall()
  assert.equal(engine.installs.length, 0)
  service.stop()
})

test(`startup installs a verified cached update once, through the existing shutdown guard`, async (t) => {
  const prepare = deferred<void>()
  const download = deferred<string[]>()
  const { service, engine } = fixture({ prepare: () => prepare.promise })
  t.after(() => service.stop())
  engine.lookup = async () => {
    engine.emit(`update-available`, { version: engine.version, forceUpdate: false })
    return { updateInfo: { version: engine.version }, downloadPromise: download.promise }
  }
  service.start()
  service.start()
  await settle()
  assert.equal(engine.installs.length, 0)
  engine.emit(`update-downloaded`, { version: engine.version })
  download.resolve([`verified-cache`])
  await settle()
  assert.equal(service.getState().restartRequired, true)
  assert.equal(engine.installs.length, 0)
  prepare.resolve()
  await settle()
  assert.deepEqual(engine.installs, [[true, true]])
  service.stop()
})

test(`a startup download that takes longer than five seconds cannot install late`, async (t) => {
  t.mock.timers.enable({ apis: [`setTimeout`] })
  let now = 0
  const download = deferred<string[]>()
  const { service, engine } = fixture({ now: () => now })
  engine.lookup = async () => {
    engine.emit(`update-available`, { version: engine.version, forceUpdate: false })
    return { updateInfo: { version: engine.version }, downloadPromise: download.promise }
  }
  service.start()
  const startup = service.check()
  await settle()
  now = 5_000
  t.mock.timers.tick(5_000)
  await startup
  assert.equal(service.getState().phase, `downloading`)
  assert.equal(service.getState().restartRequired, false)
  engine.emit(`update-downloaded`, { version: engine.version })
  download.resolve([`verified-cache`])
  await settle()
  assert.equal(service.getState().phase, `ready`)
  assert.equal(engine.installs.length, 0)
  service.stop()
})
