import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { resolveCoreExecutable } from './coreRuntimePath'

test(`resolves only the packaged Core executable`, async t => {
  const resourcesPath = await mkdtemp(join(tmpdir(), `spellbook-core-path-`))
  t.after(() => rm(resourcesPath, { recursive: true, force: true }))
  const executable = join(resourcesPath, `core`, `SpellBook.CoreHost.exe`)
  await mkdir(dirname(executable), { recursive: true })
  await writeFile(executable, `fixture`)

  assert.equal(resolveCoreExecutable(resourcesPath), executable)
})

test(`rejects a missing packaged Core executable`, async t => {
  const resourcesPath = await mkdtemp(join(tmpdir(), `spellbook-core-path-`))
  t.after(() => rm(resourcesPath, { recursive: true, force: true }))

  assert.throws(() => resolveCoreExecutable(resourcesPath), /does not exist/u)
})

test(`rejects a packaged Core link that escapes its resource directory`, async t => {
  const resourcesPath = await mkdtemp(join(tmpdir(), `spellbook-core-path-`))
  t.after(() => rm(resourcesPath, { recursive: true, force: true }))
  const outside = join(resourcesPath, `outside.exe`)
  const executable = join(resourcesPath, `core`, `SpellBook.CoreHost.exe`)
  await writeFile(outside, `fixture`)
  await mkdir(dirname(executable), { recursive: true })
  await symlink(outside, executable, `file`)

  assert.throws(() => resolveCoreExecutable(resourcesPath), /escapes packaged Core resources/u)
})