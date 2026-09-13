import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'
import { productVersion } from '@spellbook/shared/productVersion'
import { CoreProcessController } from './coreProcessController'

class FakeChild extends EventEmitter {
  readonly killCalls: NodeJS.Signals[] = []
  exitCode: number | null = null
  signalCode: NodeJS.Signals | null = null

  constructor(readonly pid = 4242, private readonly exitOnTerminate = true) {
    super()
  }

  kill(signal: NodeJS.Signals = `SIGTERM`): boolean {
    this.killCalls.push(signal)
    if (this.exitOnTerminate) {
      this.exitCode = 0
      this.signalCode = signal
      this.emit(`exit`, 0, signal)
    }
    return true
  }
}

type Readiness = {
  version: string
  instanceId: string
  processId: number
}

function createController(options: {
  child?: FakeChild
  readiness?: Readiness
  fetch?: typeof globalThis.fetch
  delay?: (milliseconds: number) => Promise<void>
  now?: () => number
} = {}) {
  const child = options.child ?? new FakeChild()
  const spawnCalls: Array<{ file: string, args: readonly string[], options: Record<string, unknown> }> = []
  const errors: unknown[] = []
  const readiness = options.readiness ?? {
    version: productVersion,
    instanceId: Buffer.from(`instance-a`).toString(`base64url`),
    processId: child.pid
  }
  const fetch = options.fetch ?? (async () => new Response(JSON.stringify({ data: readiness }), {
    status: 200,
    headers: { 'content-type': `application/json` }
  }))
  const controller = new CoreProcessController({
    executablePath: `C:\SpellBook\core\SpellBook.CoreHost.exe`,
    expectedVersion: productVersion,
    reservePort: async () => 49200,
    randomBytes: size => Buffer.from(size === 32 ? `secret-a` : `instance-a`),
    spawn: (file, args, spawnOptions) => {
      spawnCalls.push({ file, args, options: spawnOptions as Record<string, unknown> })
      return child as never
    },
    fetch,
    now: options.now ?? (() => 0),
    delay: options.delay ?? (async () => undefined),
    onError: error => errors.push(error)
  })
  return { child, controller, errors, spawnCalls }
}

test(`accepts only readiness from the spawned Core process`, async () => {
  const { controller, spawnCalls } = createController()

  assert.deepEqual(await controller.start(), {
    baseUrl: `http://127.0.0.1:49200`,
    authToken: Buffer.from(`secret-a`).toString(`base64url`)
  })
  assert.deepEqual(spawnCalls[0].args, [])
  assert.equal(spawnCalls[0].options.shell, false)
  assert.equal(spawnCalls[0].options.windowsHide, true)
  assert.equal((spawnCalls[0].options.env as NodeJS.ProcessEnv).CORE__PORT, `49200`)
  assert.equal((spawnCalls[0].options.env as NodeJS.ProcessEnv).CORE__INSTANCEID, Buffer.from(`instance-a`).toString(`base64url`))
  assert.doesNotMatch(spawnCalls[0].args.join(` `), /secret/u)
})

test(`kills the child when readiness identity does not match`, async () => {
  const child = new FakeChild()
  const { controller } = createController({
    child,
    readiness: { version: productVersion, instanceId: `other`, processId: child.pid }
  })

  await assert.rejects(() => controller.start(), /identity did not match/u)
  assert.equal(child.killCalls.length, 1)
})

test(`fails closed when a responding endpoint rejects authentication`, async () => {
  const child = new FakeChild()
  const { controller } = createController({
    child,
    fetch: async () => new Response(null, { status: 401 })
  })

  await assert.rejects(() => controller.start(), /HTTP 401/u)
  assert.deepEqual(child.killCalls, [`SIGTERM`])
})

test(`fails closed when readiness returns invalid JSON`, async () => {
  const child = new FakeChild()
  const { controller } = createController({
    child,
    fetch: async () => new Response(`not-json`, { status: 200 })
  })

  await assert.rejects(() => controller.start(), /invalid response/u)
  assert.deepEqual(child.killCalls, [`SIGTERM`])
})

test(`rejects when the child exits before readiness`, async () => {
  const child = new FakeChild()
  const { controller } = createController({
    child,
    fetch: async () => {
      queueMicrotask(() => child.emit(`exit`, 9, null))
      throw new TypeError(`not listening`)
    },
    delay: () => new Promise(() => {})
  })

  await assert.rejects(() => controller.start(), /exited before readiness/u)
})

test(`times out after ten seconds and terminates the child`, async () => {
  let now = 0
  const child = new FakeChild()
  const { controller } = createController({
    child,
    fetch: async () => { throw new TypeError(`not listening`) },
    now: () => now,
    delay: async () => { now += 10_000 }
  })

  await assert.rejects(() => controller.start(), /within 10000ms/u)
  assert.equal(child.killCalls.length, 1)
})

test(`stop is idempotent`, async () => {
  const child = new FakeChild()
  const { controller } = createController({ child })
  await controller.start()

  await Promise.all([controller.stop(), controller.stop()])

  assert.deepEqual(child.killCalls, [`SIGTERM`])
})

test(`stop forces termination after five seconds`, async () => {
  const child = new FakeChild(4242, false)
  const delays: number[] = []
  const { controller } = createController({
    child,
    delay: async milliseconds => { delays.push(milliseconds) }
  })
  await controller.start()

  await controller.stop()

  assert.deepEqual(delays, [5_000])
  assert.deepEqual(child.killCalls, [`SIGTERM`, `SIGKILL`])
})