import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import electronPath from 'electron'

const frontendRoot = resolve(fileURLToPath(new URL(`..`, import.meta.url)))
const rendererRoot = resolve(process.argv[2] ?? resolve(frontendRoot, `out/renderer`))
const host = resolve(frontendRoot, `scripts/rendererSmokeHost.mjs`)
const routes = [
  { route: `/`, selector: `.startup-overlay, .auth-screen, .overlay-shell` },
  { route: `/toast`, selector: `.toast-stage` },
  { route: `/anti-afk`, selector: `.anti-afk-status` }
]

async function inspectRoute(route, selector, output) {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  await new Promise((resolveRun, reject) => {
    const child = spawn(electronPath, [host, rendererRoot, route, selector, output], {
      env: environment,
      stdio: `inherit`,
      windowsHide: true
    })
    child.once(`error`, reject)
    child.once(`exit`, code => code === 0 ? resolveRun() : reject(new Error(`Electron exited with ${code}`)))
  })

  return JSON.parse(await readFile(output, `utf8`))
}

const directory = await mkdtemp(join(tmpdir(), `spellbook-renderer-`))

try {
  for (const [index, { route, selector }] of routes.entries()) {
    const result = await inspectRoute(route, selector, resolve(directory, `${index}.json`))
    if (result.error || !result.mounted) {
      throw new Error(`Renderer route ${route} failed at ${result.url ?? result.error}`)
    }
  }
  console.log(`Packaged renderer routes verified`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
