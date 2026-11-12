import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import { load } from 'js-yaml'
import { writeUpdatePolicy } from './writeUpdatePolicy.mjs'

test(`writes either release policy without changing installer metadata`, async (t) => {
  const scratch = resolve(import.meta.dirname, `../../../.artifacts/tmp/autoUpdater/policy`)
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(resolve(scratch, `release-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const metadata = {
    version: `3.5.1`,
    files: [{ url: `setup.exe`, size: 123, sha512: `original` }],
    path: `setup.exe`,
    sha512: `original`,
  }
  for (const forceUpdate of [true, false]) {
    await writeFile(resolve(root, `latest.yml`), JSON.stringify(metadata))
    await writeUpdatePolicy(root, `3.5.1`, { forceUpdate })
    assert.deepEqual(load(await readFile(resolve(root, `latest.yml`), `utf8`)), { ...metadata, forceUpdate })
  }
  await assert.rejects(() => writeUpdatePolicy(root, `3.5.2`, { forceUpdate: true }), /version/iu)
  for (const policy of [{}, { forceUpdate: `false` }, { forceUpdate: 1 }]) {
    await assert.rejects(() => writeUpdatePolicy(root, `3.5.1`, policy), /boolean/iu)
  }
})
