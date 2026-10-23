import assert from 'node:assert/strict'
import test from 'node:test'
import { initialGameState } from '../../shared/gameState'
import { TelemetryCaptureLifecycle } from './telemetryCaptureLifecycle'

const menu = { ...initialGameState, available: true, running: true, map: `Hastings`, playerCount: 1 }
const joined = { ...menu, connected: true, map: `Arena`, playerCount: 8 }
const endpoint = { host: `192.0.2.1`, port: 7777 }

test(`capture survives menu preparation, a matching join, menu and rejoin`, () => {
  const lifecycle = new TelemetryCaptureLifecycle()
  lifecycle.observe(menu, null)
  assert.equal(lifecycle.reasonToStop(endpoint), null)
  lifecycle.observe(joined, `192.0.2.1:7777`)
  assert.equal(lifecycle.reasonToStop(endpoint), null)
  lifecycle.observe(menu, null)
  assert.equal(lifecycle.reasonToStop(endpoint), null)
  lifecycle.observe(joined, `192.0.2.1:7777`)
  assert.equal(lifecycle.reasonToStop(endpoint), null)
})

test(`temporary unavailability is not exit and the first differing endpoint is detected`, () => {
  const lifecycle = new TelemetryCaptureLifecycle()
  lifecycle.observe(menu, null)
  lifecycle.observe({ ...initialGameState, available: false }, null)
  assert.equal(lifecycle.reasonToStop(endpoint), null)
  lifecycle.observe(joined, `192.0.2.1:7778`)
  assert.equal(lifecycle.reasonToStop(endpoint), `serverChanged`)
  lifecycle.observe({ ...initialGameState, available: true }, null)
  assert.equal(lifecycle.reasonToStop(endpoint), `gameExited`)
})

test(`an unobserved game is not treated as an exited game`, () => {
  const lifecycle = new TelemetryCaptureLifecycle()
  lifecycle.observe({ ...initialGameState, available: true }, null)
  assert.equal(lifecycle.reasonToStop(endpoint), null)
})
