import assert from 'node:assert/strict'
import test from 'node:test'
import type { GameServerRecord } from '$lib/core'
import type { ServerLiveSummary } from '@spellbook/shared/serverStore'
import type { ServerPopulationHistory } from '@spellbook/shared/gameServerOverview'
import { createDashboardChartData } from '$lib/components/dashboard/dashboardTimelineData'
import { serverInformationFields, serverPopulationTimeline, serverTechnicalDetails } from './serverOverviewPresentation'

const server = { name: `Reported`, displayName: `Display`, host: `2001:db8::1`, port: 7777, geoCountryCode: `NO`, geoCity: `Oslo` } as GameServerRecord
const live = { sources: { a2s: { fresh: true } }, ping: 0, password: false } as ServerLiveSummary

test(`information keeps endpoint identity, zero ping and false password while expired A2S becomes unknown`, () => {
  const fields = serverInformationFields(server, live)
  assert.equal(fields[0].value, `[2001:db8::1]:7777`)
  assert.equal(fields[1].value, server.name)
  assert.equal(fields[3].value, `0 ms`)
  assert.notEqual(fields[4].value, null)
  const expired = serverInformationFields(server, { ...live, sources: { ...live.sources, a2s: { ...live.sources.a2s, fresh: false } } })
  assert.deepEqual(expired.slice(-2).map(field => field.value), [null, null])
  assert.equal(serverInformationFields({ ...server, host: `127.0.0.1` }, null)[0].value, `127.0.0.1:7777`)
  assert.equal(serverInformationFields({ ...server, port: null }, null)[0].value, null)
})

test(`technical lookup distinguishes pending, absent location and zero coordinates`, () => {
  const pending = serverTechnicalDetails({} as GameServerRecord)
  assert.equal(pending.pending, true)
  assert.equal(pending.hasLocation, false)
  assert.equal(pending.hasCoordinates, false)
  const empty = serverTechnicalDetails({ geoSource: `maxmind`, geoCheckedAt: `2026-10-12T00:00:00Z` } as GameServerRecord)
  assert.equal(empty.pending, false)
  assert.equal(empty.hasLocation, false)
  const zero = serverTechnicalDetails({ geoSource: `maxmind`, geoLatitude: 0, geoLongitude: 0, geoAccuracyRadiusKm: 0 } as GameServerRecord)
  assert.equal(zero.hasLocation, true)
  assert.equal(zero.hasCoordinates, true)
  assert.deepEqual(zero.fields.slice(0, 3).map(field => field.value), [0, 0, `0 km`])
})

test(`population adapts to the shared chart without summing averages or filling gaps`, () => {
  const history: ServerPopulationHistory = {
    start: `2026-10-11T00:00:00Z`, end: `2026-10-11T04:00:00Z`, intervalMs: 3600000,
    average: 4.37, coveredMs: 3600000,
    buckets: [null, 0, 10.123, null].map((value, index) => ({ at: `2026-10-11T0${index}:00:00Z`, value }))
  }
  const timeline = serverPopulationTimeline(history)
  const chart = createDashboardChartData(timeline)
  assert.deepEqual(chart.rows.map(row => row.players), [null, 0, 10.1, null])
  assert.deepEqual(timeline.range, { start: Date.parse(history.start), end: Date.parse(history.end) })
  assert.equal(timeline.intervalMs, history.intervalMs)
  assert.equal(timeline.series.length, 1)
  assert.equal(history.average, 4.37)
  assert.equal(history.buckets[2].value, 10.123)
})
