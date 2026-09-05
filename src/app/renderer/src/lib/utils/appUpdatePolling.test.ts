import assert from 'node:assert/strict'
import test from 'node:test'

type StartAppUpdatePolling = (
  check: () => Promise<string | null>,
  publish: (version: string | null) => void,
  timers: {
    setInterval(callback: () => void, milliseconds: number): number
    clearInterval(id: number): void
  },
) => () => void

test(`checks immediately and every fifteen minutes until stopped`, async () => {
  const startAppUpdatePolling = await loadStartAppUpdatePolling()
  const versions = [`1.0.11`, `1.0.12`]
  const published: Array<string | null> = []
  let scheduled: (() => void) | undefined
  let cleared: number | undefined
  const stop = startAppUpdatePolling(
    async () => versions.shift() ?? null,
    version => published.push(version),
    {
      setInterval(callback, milliseconds) {
        assert.equal(milliseconds, 15 * 60 * 1000)
        scheduled = callback
        return 7
      },
      clearInterval(id) { cleared = id },
    },
  )

  await settle()
  assert.deepEqual(published, [`1.0.11`])

  await scheduled?.()
  assert.deepEqual(published, [`1.0.11`, `1.0.12`])

  stop()
  assert.equal(cleared, 7)
})

test(`keeps the last known version when a check fails`, async () => {
  const startAppUpdatePolling = await loadStartAppUpdatePolling()
  const published: Array<string | null> = []
  let scheduled: (() => void) | undefined
  const stop = startAppUpdatePolling(
    async () => {
      if (published.length === 0) return `1.0.11`
      throw new Error(`offline`)
    },
    version => published.push(version),
    {
      setInterval(callback) {
        scheduled = callback
        return 8
      },
      clearInterval() {},
    },
  )

  await settle()
  await scheduled?.()
  assert.deepEqual(published, [`1.0.11`])
  stop()
})

async function loadStartAppUpdatePolling(): Promise<StartAppUpdatePolling> {
  const modulePath = `./appUpdatePolling`
  const module = await import(modulePath).catch(() => ({}))
  const startAppUpdatePolling = Reflect.get(module, `startAppUpdatePolling`)
  assert.equal(typeof startAppUpdatePolling, `function`)
  return startAppUpdatePolling as StartAppUpdatePolling
}

async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
