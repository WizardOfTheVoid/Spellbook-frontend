import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function writeChecksums(files, outputPath) {
  const releaseRoot = dirname(resolve(outputPath))
  const entries = []
  const names = new Set()
  for (const inputPath of files) {
    const path = resolve(inputPath)
    const relativePath = relative(releaseRoot, path)
    if (relativePath.startsWith(`..`) || isAbsolute(relativePath)) {
      throw new Error(`Checksum input must remain inside the release root`)
    }
    if (basename(path).toLowerCase().startsWith(`.env`)) {
      throw new Error(`Checksum input must not be an environment file`)
    }
    if (!(await stat(path)).isFile()) throw new Error(`Checksum input must be a regular file`)
    const name = basename(path)
    if (names.has(name)) throw new Error(`Checksum filenames must be unique`)
    names.add(name)
    const digest = createHash(`sha256`).update(await readFile(path)).digest(`hex`).toUpperCase()
    entries.push({ name, digest })
  }
  entries.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
  await writeFile(outputPath, `${entries.map(item => `${item.digest}  ${item.name}`).join(`\n`)}\n`)
}

async function main() {
  const frontendRoot = resolve(fileURLToPath(new URL(`..`, import.meta.url)))
  const { version } = JSON.parse(await readFile(resolve(frontendRoot, `productVersion.json`), `utf8`))
  const releaseRoot = resolve(frontendRoot, `release`)
  await writeChecksums(
    [resolve(releaseRoot, `SpellBook-Setup-${version}.exe`)],
    resolve(releaseRoot, `SHA256SUMS.txt`)
  )
  console.log(`Wrote SHA256SUMS.txt for SpellBook ${version}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()