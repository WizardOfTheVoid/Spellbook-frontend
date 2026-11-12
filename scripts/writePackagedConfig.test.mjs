import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writePackagedConfig } from './writePackagedConfig.mjs'

test(`writes only normalized non-secret Server configuration`, async t => {
  const root = await mkdtemp(join(tmpdir(), `spellbook-config-write-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const outputPath = join(root, `config`, `app-config.json`)

  await writePackagedConfig({
    serverBaseUrl: `https://chivalry2.dev/api/v1/`,
    outputPath
  })

  assert.deepEqual(JSON.parse(await readFile(outputPath, `utf8`)), {
    serverBaseUrl: `https://chivalry2.dev/api/v1`
  })
})

test(`reports missing production configuration with a stable code`, async () => {
  await assert.rejects(
    writePackagedConfig({ serverBaseUrl: undefined, outputPath: `unused` }),
    error => error instanceof Error && error.message === `PRODUCTION_CONFIG_MISSING`
  )
})