import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { verifyDistribution } from './verifyDistribution.mjs'

async function createDistributionFixture(t, options = {}) {
  const releaseRoot = await mkdtemp(join(tmpdir(), `spellbook-distribution-`))
  t.after(() => rm(releaseRoot, { recursive: true, force: true }))
  const files = {
    'SpellBook-Setup-1.0.0.exe': `installer`,
    'win-unpacked/SpellBook.exe': `app`,
    'win-unpacked/resources/app/package.json': JSON.stringify({ version: options.version ?? `1.0.0` }),
    'win-unpacked/resources/app/.env': `GAME_ACTIVITY_RECHECK_MS=550`,
    'win-unpacked/resources/core/SpellBook.CoreHost.exe': `core`,
    'win-unpacked/resources/core/.env': `CORE__PORT=48125`,
    'win-unpacked/resources/LICENSE.md': `license`,
    'win-unpacked/resources/NOTICE.md': `notice`,
    'win-unpacked/resources/THIRD_PARTY_NOTICES.md': `third-party notice`
  }
  if (options.core === false) delete files['win-unpacked/resources/core/SpellBook.CoreHost.exe']
  if (options.appEnv === false) delete files['win-unpacked/resources/app/.env']
  if (options.coreEnv === false) delete files['win-unpacked/resources/core/.env']
  if (options.notice === false) delete files['win-unpacked/resources/NOTICE.md']
  if (options.license === false) delete files['win-unpacked/resources/LICENSE.md']
  if (options.envFile) files['win-unpacked/resources/core/.env.production'] = `TOKEN=secret`
  if (options.privatePath) files['win-unpacked/resources/backend/server.js'] = `private`
  if (options.unexpectedExecutable) files['win-unpacked/resources/helper.exe'] = `unexpected`
  if (options.wrongCoreName) files['win-unpacked/resources/core/ChivAdmin.CoreHost.exe'] = `wrong`

  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(releaseRoot, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  return releaseRoot
}

test(`accepts the expected unsigned Windows distribution inventory`, async t => {
  const fixture = await createDistributionFixture(t)

  assert.deepEqual(await verifyDistribution(fixture, `1.0.0`), [])
})

test(`requires Core, frontend environment files, notices, and the exact version`, async t => {
  const fixture = await createDistributionFixture(t, {
    core: false,
    appEnv: false,
    coreEnv: false,
    notice: false,
    version: `1.0.1`
  })
  const codes = (await verifyDistribution(fixture, `1.0.0`)).map(item => item.code)

  assert.ok(codes.includes(`CORE_MISSING`))
  assert.ok(codes.includes(`APP_ENV_MISSING`))
  assert.ok(codes.includes(`CORE_ENV_MISSING`))
  assert.ok(codes.includes(`NOTICE_MISSING`))
  assert.ok(codes.includes(`APP_VERSION_MISMATCH`))
})

test(`rejects unexpected environment files`, async t => {
  const fixture = await createDistributionFixture(t, { envFile: true })

  assert.ok((await verifyDistribution(fixture, `1.0.0`)).some(item =>
    item.code === `UNEXPECTED_ENV_FILE`
  ))
})

test(`rejects wrong executable names, private paths, and unexpected executables`, async t => {
  const fixture = await createDistributionFixture(t, {
    core: false,
    wrongCoreName: true,
    privatePath: true,
    unexpectedExecutable: true
  })
  const codes = (await verifyDistribution(fixture, `1.0.0`)).map(item => item.code)

  assert.ok(codes.includes(`CORE_MISSING`))
  assert.ok(codes.includes(`PRIVATE_PATH_PRESENT`))
  assert.ok(codes.includes(`UNEXPECTED_EXECUTABLE`))
})

test(`requires the exact versioned installer and base license`, async t => {
  const fixture = await createDistributionFixture(t, { license: false })
  await rm(join(fixture, `SpellBook-Setup-1.0.0.exe`))
  await writeFile(join(fixture, `SpellBook-Setup-1.0.1.exe`), `wrong installer`)
  const codes = (await verifyDistribution(fixture, `1.0.0`)).map(item => item.code)

  assert.ok(codes.includes(`INSTALLER_MISSING`))
  assert.ok(codes.includes(`LICENSE_MISSING`))
})
