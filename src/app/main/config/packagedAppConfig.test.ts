import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { parsePackagedAppConfig, readPackagedAppConfig } from './packagedAppConfig'

test(`accepts only an HTTPS v1 Server base URL`, () => {
  assert.deepEqual(parsePackagedAppConfig({
    serverBaseUrl: `https://chivalry2.dev/api/v1/`
  }), {
    serverBaseUrl: `https://chivalry2.dev/api/v1`
  })

  for (const serverBaseUrl of [
    ``,
    `http://chivalry2.dev/api/v1`,
    `https://user:pass@chivalry2.dev/api/v1`,
    `https://chivalry2.dev/api/v2`,
    `https://chivalry2.dev/api/v1?token=value`
  ]) {
    assert.throws(() => parsePackagedAppConfig({ serverBaseUrl }), /HTTPS Server URL/u)
  }
})

test(`rejects unknown configuration including token properties`, () => {
  assert.throws(() => parsePackagedAppConfig({
    serverBaseUrl: `https://chivalry2.dev/api/v1`,
    serverAuthToken: `secret`
  }), /only serverBaseUrl/u)
})

test(`reads packaged configuration and rejects absent or invalid JSON`, async t => {
  const resourcesPath = await mkdtemp(join(tmpdir(), `spellbook-app-config-`))
  t.after(() => rm(resourcesPath, { recursive: true, force: true }))

  assert.throws(() => readPackagedAppConfig(resourcesPath), /PRODUCTION_CONFIG_MISSING/u)
  await writeFile(join(resourcesPath, `app-config.json`), `not-json`)
  assert.throws(() => readPackagedAppConfig(resourcesPath), /invalid JSON/u)

  await writeFile(join(resourcesPath, `app-config.json`), JSON.stringify({
    serverBaseUrl: `https://chivalry2.dev/api/v1`
  }))
  assert.equal(readPackagedAppConfig(resourcesPath).serverBaseUrl, `https://chivalry2.dev/api/v1`)
})