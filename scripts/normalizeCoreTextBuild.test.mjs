import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { resolveConfig } from 'electron-vite'
import { build } from 'vite'

test(`Electron normalizes messages and batches before Core in the built app`, async () => {
  const directory = await mkdtemp(resolve(`.normalization-test-`))
  try {
    const { config } = await resolveConfig({}, `build`)
    const result = await build({
      ...config.main,
      configFile: false,
      logLevel: `silent`,
      build: {
        ...config.main.build,
        write: false,
        rollupOptions: {
          ...config.main.build.rollupOptions,
          input: resolve(`src/app/main/api/normalizeCoreText.ts`),
          output: { format: `cjs`, exports: `named` }
        }
      }
    })
    const entry = result.output.find(chunk => chunk.type === `chunk` && chunk.isEntry)
    assert.ok(entry)
    const file = resolve(directory, `normalizer.cjs`)
    await writeFile(file, entry.code)
    const { normalizeCoreText } = await import(pathToFileURL(file).href)

    for (const kind of [`server`, `admin`]) {
      assert.deepEqual(normalizeCoreText(`/v2/console/message`, { kind, message: `[SB] test` }), {
        kind, message: `[SB] test`
      })
      assert.deepEqual(normalizeCoreText(`/v2/console/message`, { kind, message: `  Caf\u00e9 \u65e5\u672c\u8a9e  ` }), {
        kind, message: `Cafe \u65e5\u672c\u8a9e`
      })
    }
    assert.deepEqual(normalizeCoreText(`/v2/console/batch`, { commands: [
      { commandType: `server_message`, message: `Caf\u00e9`, delayMs: 10 },
      { commandType: `admin_message`, message: `[SB] test`, delayMs: 0 }
    ] }), { commands: [
      { commandType: `server_message`, message: `Cafe`, delayMs: 10 },
      { commandType: `admin_message`, message: `[SB] test`, delayMs: 0 }
    ] })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
