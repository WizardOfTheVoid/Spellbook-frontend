import { readFile, glob } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const frontend = fileURLToPath(new URL(`../`, import.meta.url))
const patterns = JSON.parse(await readFile(new URL(`./appTests.json`, import.meta.url), `utf8`))
const files = []
for await (const file of glob(patterns, { cwd: frontend })) files.push(file)
if (!files.length) throw new Error(`No app tests found.`)
const result = spawnSync(process.execPath, [`--import`, `tsx`, `--test`, ...files.sort()], { cwd: frontend, stdio: `inherit` })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
