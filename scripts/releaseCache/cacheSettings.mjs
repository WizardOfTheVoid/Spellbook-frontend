import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { appendFile, lstat, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const cacheRoot = `.artifacts/tmp/releaseCache`
const paths = {
  npm: [`${cacheRoot}/npm/_cacache`],
  nuget: [`${cacheRoot}/nuget`],
  packaging: [`${cacheRoot}/electron`, `${cacheRoot}/builder`]
}
const hash = value => createHash(`sha256`).update(value).digest(`hex`)

export function cacheSettings({ lockfile, buildConfig, sdk, dependencyHash, platform, arch }) {
  const packages = JSON.parse(lockfile).packages
  const electron = packages?.[`node_modules/electron`]?.version
  const builder = packages?.[`node_modules/electron-builder`]?.version
  if (![electron, builder, sdk, dependencyHash, platform, arch].every(value => typeof value === `string` && /^[\w.+-]+$/u.test(value))) {
    throw new Error(`Release cache dependency identity is invalid`)
  }
  const base = `spellbook-v1-${platform}-${arch}`
  const npmPrefix = `${base}-node24-npm-`
  const nugetPrefix = `${base}-nuget-sdk${sdk.split(`.`).slice(0, 2).join(`.`)}-`
  const packagingPrefix = `${base}-electron${electron}-builder${builder}-`
  return {
    npm: { paths: paths.npm, prefix: npmPrefix, key: `${npmPrefix}${hash(lockfile)}` },
    nuget: { paths: paths.nuget, prefix: nugetPrefix, key: `${nugetPrefix}${sdk}-${dependencyHash}` },
    packaging: {
      paths: paths.packaging, prefix: packagingPrefix,
      key: `${packagingPrefix}${hash(JSON.stringify({ toolsets: buildConfig.toolsets, nsis: buildConfig.nsis }))}`
    }
  }
}

export async function clearDownloadCaches(root, group) {
  const selected = group === `all` ? Object.values(paths).flat() : paths[group]
  if (!selected) throw new Error(`Unknown release cache group`)
  const parents = new Set([`.artifacts`, `.artifacts/tmp`, cacheRoot,
    ...selected.map(path => path.slice(0, path.lastIndexOf(`/`)))])
  for (const path of parents) {
    const entry = await lstat(resolve(root, path)).catch(error => {
      if (error.code !== `ENOENT`) throw error
    })
    if (entry?.isSymbolicLink()) throw new Error(`Release cache parent must not be a link`)
  }
  for (const path of selected) await rm(resolve(root, path), { recursive: true, force: true })
}

async function main() {
  const root = process.env.GITHUB_WORKSPACE || process.cwd()
  if (process.argv[2] === `--clear`) return clearDownloadCaches(root, process.argv[3])
  const environment = {
    NPM_CONFIG_CACHE: resolve(root, cacheRoot, `npm`),
    NUGET_PACKAGES: resolve(root, cacheRoot, `nuget`),
    electron_config_cache: resolve(root, cacheRoot, `electron`),
    ELECTRON_BUILDER_CACHE: resolve(root, cacheRoot, `builder`)
  }
  await appendFile(process.env.GITHUB_ENV, Object.entries(environment).map(([key, value]) => `${key}=${value}\n`).join(``))
  const lockfile = await readFile(resolve(root, `package-lock.json`), `utf8`)
  const { build = {} } = JSON.parse(await readFile(resolve(root, `package.json`), `utf8`))
  const { stdout } = await exec(`dotnet`, [`--version`], { cwd: root })
  const settings = cacheSettings({ lockfile, buildConfig: build, sdk: stdout.trim(),
    dependencyHash: process.env.NUGET_DEPENDENCY_HASH, platform: process.env.RUNNER_OS, arch: process.env.RUNNER_ARCH })
  for (const [name, entry] of Object.entries(settings)) {
    await appendFile(process.env.GITHUB_OUTPUT, `${name}-key=${entry.key}\n${name}-prefix=${entry.prefix}\n${name}-path<<CACHE_PATHS\n${entry.paths.join(`\n`)}\nCACHE_PATHS\n`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
