import assert from 'node:assert/strict'
import test from 'node:test'
import { captureDiagnosticConsole, formatDiagnosticArguments, sanitizeDiagnosticMessage } from './diagnosticLogFormatting'

test(`diagnostics remove credentials, URL parameters and response bodies`, () => {
  const message = sanitizeDiagnosticMessage([
    `GET https://alice:url-password@example.com/api?token=private#password=hidden failed`,
    `Authorization: Bearer very-private-token`,
    `refreshToken="private-refresh" password='private-password' api_key=private-key`,
    `Bearer standalone-secret`,
    `response: {"user":"private-user","accessToken":"private-access"}`,
    `ticket abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789`,
  ].join(`\n`))

  assert.match(message, /GET https:\/\/example.com\/api failed/u)
  for (const value of [`alice`, `url-password`, `private-`, `standalone-secret`, `hidden`, `abcdef0123456789`]) {
    assert.ok(!message.includes(value), `Unexpected sensitive text: ${value}`)
  }
})

test(`diagnostics keep useful error stacks and omit objects without invoking their getters`, () => {
  const error = new Error(`Network unavailable`)
  const message = formatDiagnosticArguments([`Request failed`, error, { get token() { throw new Error(`Do not inspect`) } }])
  assert.match(message, /Request failed Error: Network unavailable/u)
  assert.match(message, /diagnosticLogFormatting.test.ts/u)
  assert.match(message, /\[details omitted\]/u)
  assert.ok(formatDiagnosticArguments([`x`.repeat(100_000)]).length <= 8_000)
})

test(`console capture keeps normal output and survives logging failures`, () => {
  const output: unknown[][] = []
  const target = { warn: (...args: unknown[]) => output.push(args), error: (...args: unknown[]) => output.push(args) }
  const originalWarn = target.warn
  const restore = captureDiagnosticConsole(target, () => { throw new Error(`IPC closed`) })
  target.warn(`Useful warning`, { response: `private` })
  assert.deepEqual(output, [[`Useful warning`, { response: `private` }]])
  restore()
  assert.equal(target.warn, originalWarn)
})
