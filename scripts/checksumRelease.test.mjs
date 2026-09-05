import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeChecksums } from './checksumRelease.mjs'

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