import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import { TelemetryNameCache } from './telemetryNameCache'
test(`lookup uses bounded GET concurrency and caches short IDs within the account epoch`, async () => {
  let active = 0,
    maximum = 0,
    calls = 0
  const cache = new TelemetryNameCache(async (path) => {
    active++
    maximum = Math.max(maximum, active)
    calls++
    await setImmediate()
    active--
    assert.ok(path.startsWith(`/players/by-playfab/`))
    return {
      ok: true,
      status: 200,
      statusText: `OK`,
      data: { ok: true, data: { player: { latestName: `Example` } } }
    }
  })
  const ids = Array.from({ length: 12 }, (_, i) => i.toString(16))
  const labels = await cache.lookup(ids)
  assert.equal(labels.length, 12)
  assert.ok(maximum <= 4)
  await cache.lookup(ids)
  assert.equal(calls, 12)
  cache.clear()
  await cache.lookup([`D6A2C4BB2600FA9`])
  assert.equal(calls, 13)
})
