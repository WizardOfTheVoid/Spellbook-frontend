import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeChecksums, writeReleaseChecksums } from './checksumRelease.mjs'
import { createHash } from 'node:crypto'

test(`writes deterministic uppercase SHA-256 checksums in ordinal filename order`, async t => {
  const root = await mkdtemp(join(tmpdir(), `spellbook-checksums-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, `b.exe`), `b`)
  await writeFile(join(root, `a.exe`), `a`)
  const outputPath = join(root, `SHA256SUMS.txt`)

  await writeChecksums([join(root, `b.exe`), join(root, `a.exe`)], outputPath)

  assert.equal(await readFile(outputPath, `utf8`), [
    `CA978112CA1BBDCAFAC231B39A23DC4DA786EFF8147C4E72B9807785AFEE48BB  a.exe`,
    `3E23E8160039594A33894F6564E1B1348BBD7A0088D42C4ACB73EEAED59C009D  b.exe`,
    ``
  ].join(`\n`))
})

test(`rejects environment files, directories, and files outside the release root`, async t => {
  const root = await mkdtemp(join(tmpdir(), `spellbook-checksums-`))
  const outsideRoot = await mkdtemp(join(tmpdir(), `spellbook-checksums-outside-`))
  t.after(() => Promise.all([
    rm(root, { recursive: true, force: true }),
    rm(outsideRoot, { recursive: true, force: true })
  ]))
  const envFile = join(root, `.env.production`)
  const outside = join(outsideRoot, `outside.exe`)
  await writeFile(envFile, `secret`)
  await writeFile(outside, `outside`)
  await mkdir(join(root, `folder`))

  await assert.rejects(() => writeChecksums([envFile], join(root, `sums.txt`)), /environment/u)
  await assert.rejects(() => writeChecksums([join(root, `folder`)], join(root, `sums.txt`)), /regular file/u)
  await assert.rejects(() => writeChecksums([outside], join(root, `sums.txt`)), /release root/u)
})

test(`release checksums cover installer, metadata and blockmap bytes`, async t => {
  const scratch = join(import.meta.dirname, `../../.artifacts/tmp/autoUpdater/checksums`)
  await mkdir(scratch, { recursive: true })
  const root = await mkdtemp(join(scratch, `release-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const files = [`SpellBook-Setup-1.0.0.exe`, `SpellBook-Setup-1.0.0.exe.blockmap`, `latest.yml`]
  for (const file of files) await writeFile(join(root, file), file)
  await writeReleaseChecksums(root, `1.0.0`)
  const entries = (await readFile(join(root, `SHA256SUMS.txt`), `utf8`)).trim().split(`\n`)
  assert.deepEqual(entries.map(line => line.split(`  `)[1]), files)
  for (let index = 0; index < files.length; index += 1) {
    await writeFile(join(root, files[index]), `changed`)
    const hash = createHash(`sha256`).update(await readFile(join(root, files[index]))).digest(`hex`).toUpperCase()
    assert.notEqual(entries[index].split(`  `)[0], hash)
  }
})
