import assert from 'node:assert/strict'
import test from 'node:test'
import { EvidencePlayback } from './evidencePlayback'

test(`a view requires two seconds of active playback`, () => {
  const playback = new EvidencePlayback()
  playback.start(0, 0)
  assert.equal(playback.sample(1.9, 1900), false)
  assert.equal(playback.sample(2, 2000), true)
  assert.equal(playback.watchedMs, 2000)
})

test(`the final playback slice counts at the two-second boundary`, () => {
  const playback = new EvidencePlayback()
  playback.start(0, 0)
  for (let tick = 1; tick < 20; tick++) playback.sample(tick / 10, tick * 100)
  assert.equal(playback.stop(2, 2000), true)
  assert.equal(playback.watchedMs, 2000)
})

test(`pause and buffering gaps do not contribute to watching time`, () => {
  const playback = new EvidencePlayback()
  playback.start(0, 0)
  assert.equal(playback.stop(0.75, 750), false)
  assert.equal(playback.sample(0.75, 10000), false)
  playback.start(0.75, 10000)
  assert.equal(playback.stop(1.5, 10750), false)
  playback.start(1.5, 20000)
  assert.equal(playback.sample(2, 20500), true)
})

test(`seeking and a frozen timeline do not produce views`, () => {
  const playback = new EvidencePlayback()
  playback.start(0, 0)
  playback.sample(0.5, 500)
  playback.suspend()
  assert.equal(playback.sample(50, 10000), false)
  playback.start(50, 10000)
  assert.equal(playback.sample(50, 20000), false)
  assert.equal(playback.sample(50.75, 20750), false)
  assert.equal(playback.sample(51.5, 21500), true)
})

test(`a seek jump without a seeking event is discarded`, () => {
  const playback = new EvidencePlayback()
  playback.start(0, 0)
  assert.equal(playback.sample(45, 3000), false)
  assert.equal(playback.watchedMs, 0)
  assert.equal(playback.sample(47, 5000), true)
})

test(`playback speed measures watched seconds rather than timeline seconds`, () => {
  const playback = new EvidencePlayback()
  playback.start(0, 0)
  assert.equal(playback.sample(2, 1000, 2), false)
  assert.equal(playback.sample(4, 2000, 2), true)
  assert.equal(playback.watchedMs, 2000)
})
