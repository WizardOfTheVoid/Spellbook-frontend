import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import test from 'node:test'
import { verifyUpdateAssets } from './verifyUpdateAssets.mjs'

async function fixture(t, metadata = {}, config = {}) {
  const scratch = resolve(import.meta.dirname, `../../../.artifacts/tmp/autoUpdater/assets`)
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, `release-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const installer = `SpellBook-Setup-1.0.0.exe`
  const bytes = Buffer.from(`installer`)
  const info = {
    url: installer,
    size: bytes.length,
    sha512: createHash(`sha512`).update(bytes).digest(`base64`),
    ...metadata,
  }
  await mkdir(join(root, `win-unpacked/resources`), { recursive: true })
  await writeFile(join(root, installer), bytes)
  await writeFile(join(root, `${installer}.blockmap`), `blockmap`)
  await writeFile(
    join(root, `latest.yml`),
    JSON.stringify({ version: `1.0.0`, path: installer, sha512: info.sha512, files: [info], forceUpdate: false, ...metadata }),
  )
  await writeFile(
    join(root, `win-unpacked/resources/app-update.yml`),
    JSON.stringify({
      provider: `github`,
      owner: `WizardOfTheVoid`,
      repo: `Spellbook-frontend`,
      updaterCacheDirName: `spellbook-updater`,
      ...config,
    }),
  )
  return root
}

test(`accepts matching unsigned update artifacts`, async (t) => {
  assert.deepEqual(await verifyUpdateAssets(await fixture(t), `1.0.0`), [])
})

for (const file of [`latest.yml`, `SpellBook-Setup-1.0.0.exe.blockmap`, `win-unpacked/resources/app-update.yml`]) {
  test(`rejects missing ${file}`, async (t) => {
    const root = await fixture(t)
    await rm(join(root, file))
    assert.ok((await verifyUpdateAssets(root, `1.0.0`)).length)
  })
}

for (const metadata of [
  { version: `1.0.1` },
  { url: `../other.exe` },
  { size: 1 },
  { sha512: `bad` },
  { path: `other.exe` },
  { files: [] },
  { forceUpdate: undefined },
  { forceUpdate: `false` },
  { files: { 0: { url: `SpellBook-Setup-1.0.0.exe`, size: 9, sha512: createHash(`sha512`).update(`installer`).digest(`base64`) }, length: 1 } },
]) {
  test(`rejects inconsistent metadata ${JSON.stringify(metadata)}`, async (t) => {
    assert.ok((await verifyUpdateAssets(await fixture(t, metadata), `1.0.0`)).length)
  })
}

for (const config of [
  { provider: `generic` },
  { owner: `other` },
  { repo: `other` },
  { token: `secret` },
  { private: true },
  { publisherName: `Legal Name` },
  { requestHeaders: { Authorization: `secret` } },
]) {
  test(`rejects unexpected packaged provider configuration ${Object.keys(config)}`, async (t) => {
    assert.ok((await verifyUpdateAssets(await fixture(t, {}, config), `1.0.0`)).length)
  })
}

test(`rejects corrupt YAML, changed installer bytes and empty blockmaps`, async (t) => {
  const root = await fixture(t)
  await writeFile(join(root, `latest.yml`), `files: [broken`)
  assert.ok((await verifyUpdateAssets(root, `1.0.0`)).length)
  const changed = await fixture(t)
  await writeFile(join(changed, `SpellBook-Setup-1.0.0.exe`), `tampered`)
  await writeFile(join(changed, `SpellBook-Setup-1.0.0.exe.blockmap`), ``)
  assert.ok((await verifyUpdateAssets(changed, `1.0.0`)).length >= 2)
})
