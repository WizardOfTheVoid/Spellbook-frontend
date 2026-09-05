import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function normalizeServerBaseUrl(value) {
  if (!value) throw new Error(`PRODUCTION_CONFIG_MISSING`)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new Error(`Production configuration requires an HTTPS Server URL ending in /v1`)
  }
  const pathname = url.pathname.replace(/\/+$/u, ``)
  if (url.protocol !== `https:` || url.username || url.password || url.search || url.hash ||
      !pathname.endsWith(`/v1`)) {
    throw new Error(`Production configuration requires an HTTPS Server URL ending in /v1`)
  }
  url.pathname = pathname
  return url.toString().replace(/\/$/u, ``)
}

export async function writePackagedConfig({ serverBaseUrl, outputPath }) {
  const config = { serverBaseUrl: normalizeServerBaseUrl(serverBaseUrl) }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`)
}

async function main() {
  const frontendRoot = resolve(fileURLToPath(new URL(`..`, import.meta.url)))
  await writePackagedConfig({
    serverBaseUrl: process.env.SPELLBOOK_SERVER_URL,
    outputPath: resolve(frontendRoot, `dist/config/app-config.json`)
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}