import assert from 'node:assert/strict'
import test from 'node:test'
import { createGeoMapController, createGeoMapMount, type GeoMapAdapter } from './geoMapController'

function fixture() {
  const calls: string[] = []
  const adapter: GeoMapAdapter = { initialize: () => { calls.push(`init`) }, replaceLayers: () => { calls.push(`layers`) },
    selectMarker: () => { calls.push(`select`) }, fitToLayers: () => { calls.push(`fit`) }, invalidateSize: () => { calls.push(`resize`) },
    retryTiles: () => { calls.push(`retry`) }, remove: () => { calls.push(`remove`) } }
  return { adapter, calls }
}

test(`one map fits new datasets once and preserves the view on selection updates`, () => {
  const f = fixture()
  const controller = createGeoMapController(f.adapter)
  const data = { datasetKey: `a`, markers: [{ id: `1`, label: `A`, latitude: 0, longitude: 0 }], circles: [], region: null, selectedMarkerId: null }
  controller.update(data)
  controller.update({ ...data, selectedMarkerId: `1` })
  assert.equal(f.calls.filter(x => x === `init`).length, 1)
  assert.equal(f.calls.filter(x => x === `layers`).length, 1)
  assert.equal(f.calls.filter(x => x === `fit`).length, 1)
  controller.update({ ...data, datasetKey: `b`, markers: [] })
  assert.equal(f.calls.filter(x => x === `fit`).length, 2)
  controller.resize()
  controller.retryTiles()
  controller.dispose()
  controller.dispose()
  controller.update(data)
  assert.equal(f.calls.filter(x => x === `remove`).length, 1)
  assert.ok(f.calls.includes(`resize`) && f.calls.includes(`retry`))
})

test(`late Leaflet loading after unmount cannot initialize a map or issue tiles`, async () => {
  const f = fixture()
  const deferred = Promise.withResolvers<GeoMapAdapter>()
  let published = false
  const mount = createGeoMapMount(async () => await deferred.promise, () => { published = true }, () => {})
  const start = mount.start()
  mount.dispose()
  deferred.resolve(f.adapter)
  await start
  assert.deepEqual(f.calls, [])
  assert.equal(published, false)
})
