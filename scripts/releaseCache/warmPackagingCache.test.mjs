import assert from 'node:assert/strict'
import test from 'node:test'

test(`warms the configured NSIS and resource tools without building an installer`, async () => {
  const { warmPackagingCache } = await import('./warmPackagingCache.mjs')
  const calls = []
  const names = [`getMakeNsisPath`, `getNsisPluginsPath`, `getNsisElevatePath`, `getRceditBundle`]
  const toolsets = Object.fromEntries(names.map(name => [name, async (...args) => { calls.push([name, ...args]) }]))
  const customNsisBinary = { url: `https://example.test/tool`, checksum: `checksum` }
  const customNsisResources = { url: `https://example.test/resources`, checksum: `resources` }
  await warmPackagingCache({ buildConfig: {
    toolsets: { nsis: `1.2.1`, winCodeSign: `1.1.0` }, nsis: { customNsisBinary, customNsisResources }
  }, toolsets })
  assert.deepEqual(calls, [
    [`getMakeNsisPath`, `1.2.1`, customNsisBinary], [`getNsisPluginsPath`, `1.2.1`, customNsisResources],
    [`getNsisElevatePath`, `1.2.1`, customNsisBinary], [`getRceditBundle`, `1.1.0`]
  ])
})

test(`a failed tool download fails warming before cache publication`, async () => {
  const { warmPackagingCache } = await import('./warmPackagingCache.mjs')
  const calls = []
  await assert.rejects(warmPackagingCache({ buildConfig: {}, toolsets: {
    getMakeNsisPath: async () => { throw new Error(`download failed`) },
    getNsisPluginsPath: async () => calls.push(`resources`)
  } }), /download failed/u)
  assert.deepEqual(calls, [])
})
