import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { resolveTelemetryImport } from './telemetryImportSelection'

async function fixture(t: TestContext, files: Record<string, unknown>) {
  const scratch = resolve(import.meta.dirname, `../../../../../.artifacts/tmp/telemetryImport/tests`)
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, `selection-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const [name, value] of Object.entries(files)) {
    await mkdir(dirname(join(root, name)), { recursive: true })
    await writeFile(join(root, name), typeof value === `string` ? value : JSON.stringify(value))
  }
  return root
}

test(`one legacy segment finds its metadata and all listed segments after moving the folder`, async (t) => {
  const root = await fixture(t, {
    'capture.json': { serverIp: `5.101.165.14`, gamePort: 10380,
      pcapFiles: [`C:\\old\\gameTraffic10.pcapng`, `C:\\old\\gameTraffic2.pcapng`] },
    'gameTraffic2.pcapng': ``,
    'gameTraffic10.pcapng': ``,
    'unrelated.pcapng': ``
  })
  const expected = { files: [join(root, `gameTraffic2.pcapng`), join(root, `gameTraffic10.pcapng`)],
    manifest: join(root, `capture.json`) }
  await writeFile(expected.manifest, `\uFEFF${await readFile(expected.manifest, `utf8`)}`)
  assert.deepEqual(await resolveTelemetryImport(join(root, `gameTraffic10.pcapng`)), expected)
  assert.deepEqual(await resolveTelemetryImport(join(root, `capture.json`)), expected)
  await assert.rejects(resolveTelemetryImport(join(root, `unrelated.pcapng`)), /belong/i)
})

test(`native manifest or any native segment opens the complete recording`, async (t) => {
  const root = await fixture(t, {
    'manifest.json': { endpoint: { host: `5.101.165.14`, port: 10120 }, state: `saved` },
    'packets/000002.pcapng': ``,
    'packets/000001.pcapng': ``,
    'derived/ignored.pcapng': ``
  })
  const expected = { files: [join(root, `packets/000001.pcapng`), join(root, `packets/000002.pcapng`)],
    manifest: join(root, `manifest.json`) }
  assert.deepEqual(await resolveTelemetryImport(join(root, `manifest.json`)), expected)
  assert.deepEqual(await resolveTelemetryImport(join(root, `packets/000002.pcapng`)), expected)
})

test(`missing segments fail without silently importing a partial recording`, async (t) => {
  const root = await fixture(t, {
    'capture.json': { pcapFiles: [`/old/part1.pcapng`, `/old/part2.pcapng`] },
    'part1.pcapng': ``
  })
  await assert.rejects(resolveTelemetryImport(join(root, `capture.json`)), /missing.*part2/i)
})

test(`standalone capture keeps only the selected file`, async (t) => {
  const root = await fixture(t, { 'one.pcapng': ``, 'other.pcapng': `` })
  assert.deepEqual(await resolveTelemetryImport(join(root, `one.pcapng`)), {
    files: [join(root, `one.pcapng`)]
  })
})

test(`native captures must finish before their segments can be imported`, async (t) => {
  const root = await fixture(t, { 'manifest.json': {}, 'packets/000001.pcapng': `` })
  for (const state of [`starting`, `recording`, `stopping`]) {
    await writeFile(join(root, `manifest.json`), JSON.stringify({ state }))
    await assert.rejects(resolveTelemetryImport(join(root, `packets/000001.pcapng`)), /stop and save/i)
  }
})

test(`unrelated JSON, invalid metadata and duplicate segment names are rejected`, async (t) => {
  const root = await fixture(t, {
    'replayData.json': {},
    'capture.json': `broken`,
    'part1.pcapng': ``
  })
  await assert.rejects(resolveTelemetryImport(join(root, `replayData.json`)), /capture.json.*manifest.json/i)
  await assert.rejects(resolveTelemetryImport(join(root, `capture.json`)), /metadata/i)
  await writeFile(join(root, `capture.json`), JSON.stringify({ pcapFiles: [`C:\\a\\part1.pcapng`, `C:\\b\\part1.pcapng`] }))
  await assert.rejects(resolveTelemetryImport(join(root, `capture.json`)), /duplicate/i)
})
