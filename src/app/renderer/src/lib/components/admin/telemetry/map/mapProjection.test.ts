import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createProjection, zoomCamera } from './mapProjection'

test(`map projection preserves equal XY scale and inverse hit coordinates`, () => {
  const projection = createProjection(
    [{ x: 0, y: 0, z: 0 }, { x: 100, y: 200, z: 0 }],
    800,
    500
  )
  const a = projection.project({ x: 20, y: 30, z: 0 })
  const b = projection.project({ x: 30, y: 40, z: 0 })
  assert.ok(Math.abs(Math.abs(a.x - b.x) - Math.abs(a.y - b.y)) < 0.0001)
  const restored = projection.inverse(a)
  assert.ok(Math.abs(restored.x - 20) < 0.0001 && Math.abs(restored.y - 30) < 0.0001)
})

test(`pan and zoom keep map selection coordinates reversible`, () => {
  const projection = createProjection(
    [{ x: -100, y: -100, z: 0 }, { x: 100, y: 100, z: 0 }],
    280,
    280,
    2,
    { x: 25, y: -10 }
  )
  assert.deepEqual(projection.project({ x: 20, y: 30, z: 500 }), { x: 205, y: 70 })
  assert.deepEqual(projection.inverse({ x: 205, y: 70 }), { x: 20, y: 30, z: 0 })
})

test(`fit ignores unknown coordinates and leaves room around the observed bounds`, () => {
  const projection = createProjection(
    [{ x: 0, y: 0, z: 0 }, { x: 100, y: 200, z: 0 }, { x: NaN, y: Infinity, z: 0 }],
    800,
    500
  )
  assert.deepEqual(projection.project({ x: 0, y: 0, z: 0 }), { x: 295, y: 460 })
  assert.deepEqual(projection.project({ x: 100, y: 200, z: 0 }), { x: 505, y: 40 })
})

test(`an empty map has a finite world origin and reversible coordinates`, () => {
  const projection = createProjection([], 800, 500)
  assert.deepEqual(projection.project({ x: 0, y: 0, z: 0 }), { x: 400, y: 250 })
  assert.ok(Number.isFinite(projection.scale) && projection.scale > 0)
  assert.deepEqual(projection.inverse({ x: 400, y: 250 }), { x: 0, y: 0, z: 0 })
})

test(`zoom keeps the world point beneath the pointer in place`, () => {
  const points = [{ x: -100, y: -100, z: 0 }, { x: 100, y: 100, z: 0 }]
  const camera = { zoom: 1, pan: { x: 30, y: -20 } }
  const anchor = { x: 220, y: 90 }
  const before = createProjection(points, 500, 300, camera.zoom, camera.pan)
  const next = zoomCamera(camera, 2, anchor, { x: 250, y: 150 })
  const after = createProjection(points, 500, 300, next.zoom, next.pan)
  assert.equal(after.scale, before.scale * 2)
  assert.deepEqual(after.project(before.inverse(anchor)), anchor)
})

test(`zoom stays bounded while preserving the anchor at either limit`, () => {
  const center = { x: 400, y: 250 }
  const anchor = { x: 50, y: 80 }
  const upper = zoomCamera({ zoom: 20, pan: { x: 30, y: -20 } }, 2, anchor, center)
  const lower = zoomCamera({ zoom: 0.1, pan: { x: 30, y: -20 } }, 0.5, anchor, center)
  assert.deepEqual(upper, { zoom: 20, pan: { x: 30, y: -20 } })
  assert.deepEqual(lower, { zoom: 0.1, pan: { x: 30, y: -20 } })
})
