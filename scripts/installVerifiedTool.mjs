import { createHash, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const allowedHosts = new Set([
  `github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`
])

async function download(url, fetcher) {
  let current = new URL(url)
  for (let redirect = 0; redirect <= 5; redirect += 1) {
    if (!allowedHosts.has(current.hostname)) throw new Error(`Tool redirect host is not allowed`)
    const response = await fetcher(current, { redirect: `manual` })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get(`location`)
      if (!location) throw new Error(`Tool redirect is missing a location`)
      current = new URL(location, current)
      continue
    }
    if (!response.ok) throw new Error(`Tool download failed with HTTP ${response.status}`)
    return Buffer.from(await response.arrayBuffer())
  }
  throw new Error(`Tool download exceeded redirect limit`)
}

async function defaultExtract(archivePath, outputDirectory) {
  await exec(`tar`, [`-xf`, archivePath, `-C`, outputDirectory])
}

export async function installVerifiedTool(options) {
  if (!/^[0-9a-f]{64}$/u.test(options.sha256)) throw new Error(`Tool checksum must be lowercase SHA-256`)
  const outputDirectory = resolve(options.outputDirectory)
  if (!isAbsolute(outputDirectory)) throw new Error(`Tool output directory must be absolute`)
  await mkdir(outputDirectory, { recursive: true })
  const archive = await download(options.url, options.fetch ?? globalThis.fetch)
  const digest = createHash(`sha256`).update(archive).digest(`hex`)
  if (digest !== options.sha256) throw new Error(`Tool archive checksum did not match`)
  const archivePath = join(outputDirectory, `.${randomUUID()}-${basename(new URL(options.url).pathname)}`)
  try {
    await writeFile(archivePath, archive)
    await (options.extract ?? defaultExtract)(archivePath, outputDirectory)
  } finally {
    await rm(archivePath, { force: true })
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function main() {
  const url = argument(`--url`)
  const sha256 = argument(`--sha256`)
  const outputDirectory = argument(`--output`)
  if (!url || !sha256 || !outputDirectory) throw new Error(`--url, --sha256, and --output are required`)
  await installVerifiedTool({ url, sha256, outputDirectory })
  console.log(`Verified tool installed to ${outputDirectory}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}