import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const lockfile = JSON.stringify({ packages: {
  [`node_modules/electron`]: { version: `40.0.0` },
  [`node_modules/electron-builder`]: { version: `26.0.0` }
} })
const input = { lockfile, buildConfig: {}, sdk: `8.0.419`, dependencyHash: `core-hash`, platform: `Windows`, arch: `X64` }

test(`dependency keys share compatible downloads across releases and isolate toolchains`, async () => {
  const { cacheSettings } = await import('./cacheSettings.mjs')
  const first = cacheSettings(input)
  const next = cacheSettings({ ...input, lockfile: JSON.stringify({ ...JSON.parse(lockfile), version: `4.0.0` }) })
  assert.notEqual(first.npm.key, next.npm.key)
  assert.equal(first.npm.prefix, next.npm.prefix)
  assert.equal(first.nuget.key, next.nuget.key)
  assert.equal(first.packaging.key, next.packaging.key)
  assert.notEqual(first.nuget.key, cacheSettings({ ...input, dependencyHash: `changed` }).nuget.key)
  assert.notEqual(first.nuget.prefix, cacheSettings({ ...input, sdk: `10.0.100` }).nuget.prefix)
  assert.notEqual(first.npm.prefix, cacheSettings({ ...input, platform: `Linux` }).npm.prefix)
  assert.notEqual(first.packaging.key, cacheSettings({ ...input, buildConfig: { toolsets: { nsis: `1.2.1` } } }).packaging.key)
  assert.deepEqual(first.packaging.paths, [`.artifacts/tmp/releaseCache/electron`, `.artifacts/tmp/releaseCache/builder`])
  assert.deepEqual(first.npm.paths, [`.artifacts/tmp/releaseCache/npm/_cacache`])
})

test(`cache cleanup removes only its owned downloads and rejects escaping paths`, async t => {
  const { clearDownloadCaches } = await import('./cacheSettings.mjs')
  const scratch = resolve(`.artifacts/tmp/releasePerformance`)
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(resolve(scratch, `cache-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cachePath = resolve(root, `.artifacts/tmp/releaseCache/npm/_cacache`)
  await mkdir(cachePath, { recursive: true })
  await writeFile(resolve(cachePath, `partial`), `broken`)
  await writeFile(resolve(root, `keep`), `source`)
  await clearDownloadCaches(root, `npm`)
  await assert.rejects(readFile(resolve(cachePath, `partial`)), /ENOENT/u)
  assert.equal(await readFile(resolve(root, `keep`), `utf8`), `source`)
  await assert.rejects(clearDownloadCaches(root, `../outside`), /cache/iu)
})

test(`cache cleanup refuses a linked npm parent without touching its target`, async t => {
  const { clearDownloadCaches } = await import('./cacheSettings.mjs')
  const scratch = resolve(`.artifacts/tmp/releasePerformance`)
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(resolve(scratch, `cache-link-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const cache = resolve(root, `.artifacts/tmp/releaseCache`)
  const target = resolve(root, `keep`)
  await mkdir(cache, { recursive: true })
  await mkdir(resolve(target, `_cacache`), { recursive: true })
  await writeFile(resolve(target, `_cacache/partial`), `retained`)
  await symlink(target, resolve(cache, `npm`), process.platform === `win32` ? `junction` : `dir`)
  await assert.rejects(clearDownloadCaches(root, `npm`), /link/iu)
  assert.equal(await readFile(resolve(target, `_cacache/partial`), `utf8`), `retained`)
})
