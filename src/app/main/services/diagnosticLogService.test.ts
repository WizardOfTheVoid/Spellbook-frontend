import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { DiagnosticLogService } from './diagnosticLogService'

test(`logs survive a restart and export both bounded files in chronological order`, async t => {
  const directory = await mkdtemp(join(tmpdir(), `spellbook-logs-`))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const logs = new DiagnosticLogService(directory, 512)
  for (let index = 0; index < 12; index++) {
    logs.write(`renderer`, { level: `error`, message: `Failure ${index}` })
  }
  await logs.flush()
  await assert.rejects(() => logs.exportTo(join(directory, `current.log`)), /separate file/u)
  const restarted = new DiagnosticLogService(directory, 512)
  restarted.write(`main`, { level: `info`, message: `Restarted` })
  const destination = join(directory, `export.log`)
  await restarted.exportTo(destination)
  const output = await readFile(destination, `utf8`)
  assert.match(output, /Failure 11/u)
  assert.ok(output.indexOf(`Failure 11`) < output.indexOf(`Restarted`))
  for (const file of [`previous.log`, `current.log`]) {
    assert.ok((await stat(join(directory, file))).size <= 512)
  }
  assert.ok((await stat(destination)).size <= 1_024)
  assert.deepEqual((await readdir(directory)).sort(), [`current.log`, `export.log`, `previous.log`])
})

test(`logger bounds floods and sanitizes messages before writing to disk`, async t => {
  const directory = await mkdtemp(join(tmpdir(), `spellbook-logs-`))
  t.after(() => rm(directory, { recursive: true, force: true }))
  let now = 10_000
  const logs = new DiagnosticLogService(directory, 512 * 1024, () => now)
  for (let index = 0; index < 500; index++) {
    logs.write(`renderer`, { level: `warn`, message: `Attempt ${index}: token=private` })
  }
  await logs.flush()
  now += 10_000
  logs.write(`main`, { level: `info`, message: `Next window` })
  await logs.flush()
  const output = await readFile(join(directory, `current.log`), `utf8`)
  assert.equal(output.trim().split(`\n`).length, 201)
  assert.ok(!output.includes(`private`))
  assert.match(output, /Next window/u)
})

test(`write failures stay contained and prevent a misleading successful export`, async t => {
  const directory = await mkdtemp(join(tmpdir(), `spellbook-logs-`))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const logs = new DiagnosticLogService(join(directory, `invalid\0directory`))
  assert.doesNotThrow(() => logs.write(`main`, { level: `error`, message: `Failure` }))
  await assert.rejects(() => logs.exportTo(join(directory, `export.log`)), /could not be written/u)
})
