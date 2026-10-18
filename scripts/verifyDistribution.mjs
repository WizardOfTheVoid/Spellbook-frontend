import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const privateSegments = new Set([`backend`, `database`, `databases`, `db`, `migrations`, `.forensics`])

async function inspectTree(root) {
  const files = []
  const links = []

  async function visit(directory) {
    for (const name of await readdir(directory)) {
      const path = resolve(directory, name)
      const stats = await lstat(path)
      if (stats.isSymbolicLink()) links.push(path)
      else if (stats.isDirectory()) await visit(path)
      else if (stats.isFile()) files.push(path)
    }
  }

  await visit(root)
  return { files, links }
}

async function exists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === `ENOENT`) return false
    throw error
  }
}

async function readPackagedVersion(resourcesRoot) {
  const unpackedManifest = resolve(resourcesRoot, `app`, `package.json`)
  if (await exists(unpackedManifest)) {
    return JSON.parse(await readFile(unpackedManifest, `utf8`)).version
  }

  const archive = resolve(resourcesRoot, `app.asar`)
  if (!await exists(archive)) return undefined
  const { extractFile } = await import(`@electron/asar`)
  return JSON.parse(extractFile(archive, `package.json`).toString(`utf8`)).version
}

export async function verifyDistribution(releaseRoot, expectedVersion) {
  const violations = []
  const unpackedRoot = resolve(releaseRoot, `win-unpacked`)
  const resourcesRoot = resolve(unpackedRoot, `resources`)
  const required = [
    [`INSTALLER_MISSING`, resolve(releaseRoot, `SpellBook-Setup-${expectedVersion}.exe`)],
    [`APP_MISSING`, resolve(unpackedRoot, `SpellBook.exe`)],
    [`APP_ENV_MISSING`, resolve(resourcesRoot, `app`, `.env`)],
    [`CORE_MISSING`, resolve(resourcesRoot, `core`, `SpellBook.CoreHost.exe`)],
    [`CORE_ENV_MISSING`, resolve(resourcesRoot, `core`, `.env`)],
    [`LICENSE_MISSING`, resolve(resourcesRoot, `LICENSE.md`)],
    [`NOTICE_MISSING`, resolve(resourcesRoot, `NOTICE.md`)],
    [`THIRD_PARTY_NOTICE_MISSING`, resolve(resourcesRoot, `THIRD_PARTY_NOTICES.md`)]
  ]
  for (const [code, path] of required) {
    if (!await exists(path)) violations.push({ code, path: relative(releaseRoot, path) })
  }

  if (await exists(unpackedRoot)) {
    const packagedVersion = await readPackagedVersion(resourcesRoot)
    if (packagedVersion !== expectedVersion) {
      violations.push({ code: `APP_VERSION_MISMATCH`, path: `win-unpacked/resources` })
    }

    const { files, links } = await inspectTree(unpackedRoot)
    for (const path of links) {
      violations.push({ code: `LINK_PRESENT`, path: relative(releaseRoot, path) })
    }
    const allowedExecutables = new Set([
      resolve(unpackedRoot, `SpellBook.exe`).toLowerCase(),
      resolve(resourcesRoot, `core`, `SpellBook.CoreHost.exe`).toLowerCase(),
      resolve(resourcesRoot, `elevate.exe`).toLowerCase()
    ])
    const allowedEnvironmentFiles = new Set([
      resolve(resourcesRoot, `app`, `.env`).toLowerCase(),
      resolve(resourcesRoot, `core`, `.env`).toLowerCase()
    ])
    for (const path of files) {
      const relativePath = relative(releaseRoot, path).replaceAll(`\\`, `/`)
      const segments = relativePath.toLowerCase().split(`/`)
      if (basename(path).toLowerCase().startsWith(`.env`) && !allowedEnvironmentFiles.has(path.toLowerCase())) {
        violations.push({ code: `UNEXPECTED_ENV_FILE`, path: relativePath })
      }
      if (segments.some(segment => privateSegments.has(segment))) {
        violations.push({ code: `PRIVATE_PATH_PRESENT`, path: relativePath })
      }
      if (path.toLowerCase().endsWith(`.exe`) && !allowedExecutables.has(path.toLowerCase())) {
        violations.push({ code: `UNEXPECTED_EXECUTABLE`, path: relativePath })
      }
    }
  }
  return violations
}

async function main() {
  const frontendRoot = resolve(fileURLToPath(new URL(`..`, import.meta.url)))
  const manifest = JSON.parse(await readFile(resolve(frontendRoot, `productVersion.json`), `utf8`))
  const violations = await verifyDistribution(resolve(frontendRoot, `release`), manifest.version)
  if (violations.length > 0) {
    for (const violation of violations) console.error(`${violation.code}: ${violation.path}`)
    process.exitCode = 1
    return
  }
  console.log(`SpellBook ${manifest.version} distribution verified`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
