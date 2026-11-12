import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function warmPackagingCache({ buildConfig, toolsets }) {
  const { nsis, winCodeSign } = buildConfig.toolsets ?? {}
  const { customNsisBinary, customNsisResources } = buildConfig.nsis ?? {}
  await toolsets.getMakeNsisPath(nsis, customNsisBinary)
  await toolsets.getNsisPluginsPath(nsis, customNsisResources)
  await toolsets.getNsisElevatePath(nsis, customNsisBinary)
  await toolsets.getRceditBundle(winCodeSign)
}

async function main() {
  const { build = {} } = JSON.parse(await readFile(`package.json`, `utf8`))
  const toolsets = await import('app-builder-lib/out/toolsets/windows.js')
  await warmPackagingCache({ buildConfig: build, toolsets })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
