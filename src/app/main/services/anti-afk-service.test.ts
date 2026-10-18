import assert from 'node:assert/strict'
import test from 'node:test'
import type { HttpClient } from '../api/http-client'
import type { CoreCommand } from '../../shared/coreAction'
import type { ActionExecutionOptions } from '../core/actionClient'
import { FocusStateFactory } from '../focus/focus-state-factory'
import type { RequestIdFactory } from '../request-id-factory'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { AntiAfkService, type AntiAfkScheduler } from './anti-afk-service'
import type { AntiAfkConfig } from './antiAfkConfig'
import type { OverlayActivityGuard } from './overlay-activity-guard'

type ScheduledCallback = () => void

const defaultConfig: AntiAfkConfig = {
  intervalMs: 60_000,
  minimumMovementIdleMs: 120_000,
  presses: [
    { virtualKey: 0x57, durationMs: 20 },
    { virtualKey: 0x53, durationMs: 20 }
  ]
}

function createFixture(
  gameIsFocused = true,
  overlayActive = false,
  metaUnavailable = false,
  config: AntiAfkConfig = defaultConfig,
  textInputActive = false,
  initialTimeSinceMovementMs = config.minimumMovementIdleMs,
  movementAvailable = true
) {
  const intervals = new Map<number, ScheduledCallback>()
  const cleared: number[] = []
  const directCalls: Array<{ path: string, init?: RequestInit }> = []
  const inputCalls: Array<{ commands: CoreCommand[], options: ActionExecutionOptions }> = []
  const statusEvents: string[] = []
  let nextTimer = 0
  let timeSinceMovementMs = initialTimeSinceMovementMs
  let checkLockActive = false

  const scheduler: AntiAfkScheduler = {
    setInterval: (callback, intervalMs) => {
      intervals.set(intervalMs, callback)
      nextTimer += 1
      return nextTimer
    },
    clearInterval: timer => {
      cleared.push(timer as number)
    }
  }
  const httpClient = {
    callCore: async (path: string, init?: RequestInit) => {
      directCalls.push({ path, init })
      if (path === `/v2/meta/get` && metaUnavailable) {
        throw new Error('Core unavailable')
      }
      return path === `/v2/meta/get`
        ? {
            ok: true,
            status: 200,
            statusText: `OK`,
            data: {
              ok: true,
              data: {
                focus: { gameIsFocused },
                movement: { available: movementAvailable, timeSinceMovementMs, checkLockActive }
              }
            }
          }
        : { ok: true, status: 200, statusText: 'OK', data: { ok: true } }
    },
    executeAction: async (commands: CoreCommand[], options: ActionExecutionOptions) => {
      inputCalls.push({ commands, options })
      return { ok: true, status: 200, statusText: 'OK', data: { ok: true } }
    }
  } as unknown as HttpClient
  const focusStates = new FocusStateFactory({
    isFocused: () => false
  } as OverlayWindowController)
  const service = new AntiAfkService(
    httpClient,
    { next: scope => `test-${scope}` } as RequestIdFactory,
    focusStates,
    {
      show: () => statusEvents.push('show'),
      hide: () => statusEvents.push('hide')
    },
    {
      isOverlayActive: () => overlayActive,
      getInactiveGameCommandResult: () => textInputActive
        ? {
            ok: false,
            status: 409,
            statusText: `TEXT_INPUT_ACTIVE`,
            data: null,
            error: {
              code: `TEXT_INPUT_ACTIVE`,
              message: `Finish editing before sending game commands.`
            }
          }
        : null
    } as OverlayActivityGuard,
    config,
    scheduler
  )

  return {
    service,
    intervals,
    cleared,
    directCalls,
    inputCalls,
    statusEvents,
    setCheckLockActive: (value: boolean) => { checkLockActive = value },
    setTimeSinceMovementMs: (value: number) => {
      timeSinceMovementMs = value
    }
  }
}

test(`Debug suspension keeps Anti-AFK preference and respects later disable`, async () => {
  const fixture = createFixture()
  await fixture.service.setEnabled(true)
  await fixture.service.setDebugPaused(true)
  fixture.intervals.get(60_000)?.()
  await flush()
  assert.equal(fixture.inputCalls.length, 0)
  assert.deepEqual(fixture.service.getState(), { enabled: true })
  await fixture.service.setDebugPaused(false)
  fixture.intervals.get(60_000)?.()
  await flush()
  assert.equal(fixture.inputCalls.length, 1)
  await fixture.service.setDebugPaused(true)
  await fixture.service.setEnabled(false)
  await fixture.service.setDebugPaused(false)
  fixture.intervals.get(60_000)?.()
  assert.equal(fixture.inputCalls.length, 1)
  assert.deepEqual(fixture.service.getState(), { enabled: false })
})

for (const overlayActive of [false, true]) test(`Anti-AFK submits an ordered system key Action with overlay active ${overlayActive}`, async () => {
  const fixture = createFixture(true, overlayActive)
  assert.deepEqual(await fixture.service.setEnabled(true), { enabled: true })
  assert.deepEqual([...fixture.intervals.keys()].sort((a, b) => a - b), [1000, 60000])
  assert.equal(fixture.inputCalls.length, 0)
  fixture.intervals.get(60000)?.()
  await flush()
  assert.deepEqual(fixture.inputCalls, [{
    commands: [{ type: `keys`, minimumIdleMs: 120_000, presses: [...defaultConfig.presses] }],
    options: { id: `test-anti-afk`, author: `system`, priority: `normal`, signal: fixture.inputCalls[0]?.options.signal }
  }])
})

for (const stop of [false, true]) test(`Anti-AFK ${stop ? `stop` : `disable`} cancels a pending pulse`, async () => {
  const fixture = createFixture()
  await fixture.service.setEnabled(true)
  fixture.intervals.get(60000)?.()
  const signal = fixture.inputCalls[0]?.options.signal
  assert.ok(signal)
  if (stop) fixture.service.stop()
  else await fixture.service.setEnabled(false)
  assert.equal(signal.aborted, true)
})

test(`an active text input skips the Anti-AFK pulse without moving focus`, async () => {
  const fixture = createFixture(true, true, false, defaultConfig, true)
  await fixture.service.setEnabled(true)
  fixture.intervals.get(60_000)?.()
  await flush()
  assert.equal(fixture.inputCalls.length, 0)
  assert.deepEqual(fixture.service.getState(), { enabled: true })
})

test(`configured interval, idle duration and ordered presses drive the Anti-AFK Action`, async () => {
  const presses = [{ virtualKey: 0x57, durationMs: 20 }, { virtualKey: 0x53, durationMs: 25 }]
  const fixture = createFixture(true, false, false, { intervalMs: 45_000, minimumMovementIdleMs: 180_000, presses })
  await fixture.service.setEnabled(true)
  fixture.intervals.get(45_000)?.()
  await flush()
  assert.deepEqual(fixture.inputCalls[0]?.commands, [{ type: `keys`, minimumIdleMs: 180_000, presses }])
})

test('status remains visible only while Core reports the game foreground and movement gate is open', async () => {
  const focused = createFixture(true)
  const unfocused = createFixture(false)

  await focused.service.setEnabled(true)
  await unfocused.service.setEnabled(true)

  assert.equal(focused.statusEvents.at(-1), 'show')
  assert.equal(unfocused.statusEvents.at(-1), 'hide')
})

test('status follows the minimum movement idle gate', async () => {
  const fixture = createFixture(true, false, false, defaultConfig, false, 119_999)

  await fixture.service.setEnabled(true)
  assert.equal(fixture.statusEvents.at(-1), `hide`)

  fixture.setTimeSinceMovementMs(120_000)
  fixture.intervals.get(1_000)?.()
  await flush()
  assert.equal(fixture.statusEvents.at(-1), `show`)

  fixture.setTimeSinceMovementMs(0)
  fixture.intervals.get(1_000)?.()
  await flush()
  assert.equal(fixture.statusEvents.at(-1), `hide`)
})

test(`A round-trip check lock temporarily hides Anti-AFK status`, async () => {
  const fixture = createFixture()
  fixture.setCheckLockActive(true)
  await fixture.service.setEnabled(true)
  assert.equal(fixture.statusEvents.at(-1), `hide`)
  fixture.setCheckLockActive(false)
  fixture.intervals.get(1000)?.()
  await flush()
  assert.equal(fixture.statusEvents.at(-1), `show`)
})

test('Core metadata failure keeps Anti-AFK enabled with the status hidden', async () => {
  const fixture = createFixture(true, false, true)

  assert.deepEqual(await fixture.service.setEnabled(true), { enabled: true })
  assert.equal(fixture.statusEvents.at(-1), 'hide')
  assert.deepEqual([...fixture.intervals.keys()].sort((a, b) => a - b), [1000, 60000])
})

test('disabling clears both timers and hides the permanent status', async () => {
  const fixture = createFixture()
  await fixture.service.setEnabled(true)

  assert.deepEqual(await fixture.service.setEnabled(false), { enabled: false })

  assert.deepEqual(fixture.cleared.sort((a, b) => a - b), [1, 2])
  assert.equal(fixture.statusEvents.at(-1), 'hide')
})

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}
