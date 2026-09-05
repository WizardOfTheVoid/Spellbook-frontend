import { lstat, readFile, readdir } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const requiredPaths = [
  `README.md`, `LICENSE.md`, `NOTICE.md`, `THIRD_PARTY_NOTICES.md`,
  `package.json`, `package-lock.json`, `productVersion.json`, `src/app`, `src/app/.env`,
  `src/core`, `src/core/CoreHost/.env`, `packages/shared/src`
]
const publicEnvPaths = new Set([`src/app/.env`, `src/core/corehost/.env`])
const privateRootSegments = new Set([`backend`, `server`, `bot`, `database`, `databases`, `db`, `migrations`, `.forensics`])
const privateNestedSegments = new Set([`.forensics`, `database`, `databases`, `db`, `migrations`])
const excludedDirectories = new Set([
  `node_modules`, `.svelte-kit`, `out`, `dist`, `release`, `coverage`, `bin`, `obj`,
  `.artifacts`, `.tmp`, `tmp`, `temp`
])
const sourceExtensions = new Set([`.js`, `.mjs`, `.cjs`, `.ts`, `.mts`, `.cts`, `.tsx`, `.svelte`])
const dependencyPattern = /^\s*(?:(?:import|export)\s+(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]|(?:const|let|var)\s+\w+\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)|(?:const|let|var)\s+\w+\s*=\s*await\s+import\(\s*['"]([^'"]+)['"]\s*\))/gmu

async function pathExists(path) {
  try {
    await lstat(path)
    return true
  } catch (error) {
    if (error?.code === `ENOENT`) return false
    throw error
  }
}

async function inspectTree(root) {
  const files = []
  const links = []
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isSymbolicLink()) links.push(path)
      else if (entry.isDirectory() && !excludedDirectories.has(entry.name.toLowerCase())) await visit(path)
      else if (entry.isFile()) files.push(path)
    }
  }
  await visit(root)
  return { files, links }
}

function relativeDisplay(root, path) {
  return relative(root, path).replaceAll(`\\`, `/`)
}

async function localCheckoutRoot(publicRoot) {
  try {
    const { stdout } = await exec(`git`, [`-C`, publicRoot, `rev-parse`, `--show-toplevel`], { encoding: `utf8` })
    const gitRoot = resolve(stdout.trim())
    return gitRoot === publicRoot || resolve(gitRoot, `frontend`) === publicRoot ? gitRoot : null
  } catch {
    return null
  }
}

async function isIgnoredLocalFile(gitRoot, path) {
  if (!gitRoot) return false
  try {
    await exec(`git`, [`-C`, gitRoot, `check-ignore`, `--quiet`, `--`, path])
    return true
  } catch (error) {
    if (error?.code === 1) return false
    throw error
  }
}

export async function inspectPublicTree(root) {
  const publicRoot = resolve(root)
  const gitRoot = await localCheckoutRoot(publicRoot)
  const violations = []
  for (const requiredPath of requiredPaths) {
    if (!await pathExists(resolve(publicRoot, requiredPath))) {
      violations.push({ code: `REQUIRED_PATH_MISSING`, path: requiredPath })
    }
  }

  const { files, links } = await inspectTree(publicRoot)
  for (const path of links) violations.push({ code: `LINK`, path: relativeDisplay(publicRoot, path) })
  for (const path of files) {
    const displayPath = relativeDisplay(publicRoot, path)
    const segments = displayPath.toLowerCase().split(`/`)
    const name = segments.at(-1) ?? ``
    if (name !== `.env.example` && name.startsWith(`.env`) && !publicEnvPaths.has(displayPath.toLowerCase())) {
      if (!await isIgnoredLocalFile(gitRoot, path)) {
        violations.push({ code: `ENV_FILE`, path: displayPath })
      }
    }
    if (privateRootSegments.has(segments[0]) || segments.slice(1).some(segment => privateNestedSegments.has(segment))) {
      violations.push({ code: `PRIVATE_PATH`, path: displayPath })
    }
    if (/^(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)|\.(?:pem|pfx|p12|key)$/iu.test(name)) {
      violations.push({ code: `CREDENTIAL_FILE`, path: displayPath })
    }
    if (!sourceExtensions.has(extname(path).toLowerCase())) continue
    const source = await readFile(path, `utf8`)
    for (const match of source.matchAll(dependencyPattern)) {
      const specifier = match[1] ?? match[2] ?? match[3]
      if (!specifier?.startsWith(`.`)) continue
      const target = resolve(dirname(path), specifier)
      const targetRelative = relative(publicRoot, target)
      if (targetRelative.startsWith(`..`) || isAbsolute(targetRelative)) {
        violations.push({ code: `ESCAPING_IMPORT`, path: displayPath })
      }
    }
  }
  return violations
}

async function main() {
  const root = resolve(process.argv[2] ?? `.`)
  const violations = await inspectPublicTree(root)
  if (violations.length > 0) {
    for (const violation of violations) console.error(`${violation.code}: ${violation.path}`)
    process.exitCode = 1
    return
  }
  console.log(`Public frontend policy verified`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
