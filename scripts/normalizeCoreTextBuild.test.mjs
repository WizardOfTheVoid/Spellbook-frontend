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
          input: resolve(`src/app/main/core/actionBuilder.ts`),
          output: { format: `cjs`, exports: `named` }
        }
      }
    })
    const entry = result.output.find(chunk => chunk.type === `chunk` && chunk.isEntry)
    assert.ok(entry)
    const file = resolve(directory, `normalizer.cjs`)
    await writeFile(file, entry.code)
    const { ActionBuilder } = await import(pathToFileURL(file).href)

    const builder = new ActionBuilder()
    for (const kind of [`server`, `admin`]) {
      const command = kind === `server` ? `Serversay` : `Adminsay`
      assert.equal(builder.message(kind, `[SB] test`)[0].command, `${command} "[SB] test"`)
      assert.equal(builder.message(kind, `  Caf\u00e9 \u65e5\u672c\u8a9e  `)[0].command, `${command} "Cafe \u65e5\u672c\u8a9e"`)
    }
    assert.deepEqual(builder.batch([
      { commandType: `server_message`, message: `Caf\u00e9`, delayMs: 10 },
      { commandType: `warn`, message: `[SB] test`, delayMs: 0 }
    ]).map(({ command, delayMs }) => [command, delayMs]), [[`Serversay "Cafe"`, 10], [`Serversay "[SB] test"`, 0]])

  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
