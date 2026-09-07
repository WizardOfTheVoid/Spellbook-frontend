import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u

async function readJson(frontendRoot, relativePath) {
  return JSON.parse(await readFile(resolve(frontendRoot, relativePath), `utf8`))
}

export async function checkFrontendVersion(frontendRoot) {
  const violations = []
  const canonical = await readJson(frontendRoot, `productVersion.json`)
  const version = canonical?.version
  if (typeof version !== `string` || !stableVersion.test(version)) {
    return [`productVersion.json must contain a stable major.minor.patch version`]
  }

  const [readme, manifest, lock, msBuild, sharedModule] = await Promise.all([
    readFile(resolve(frontendRoot, `README.md`), `utf8`),
    readJson(frontendRoot, `package.json`),
    readJson(frontendRoot, `package-lock.json`),
    readFile(resolve(frontendRoot, `src/core/Directory.Build.props`), `utf8`),
    readFile(resolve(frontendRoot, `packages/shared/src/productVersion.ts`), `utf8`)
  ])
  const expectedReadmeBadge = `<img src="https://img.shields.io/badge/version-${version}-f2bd2e" alt="Version ${version}">`
  if (!readme.includes(expectedReadmeBadge)) violations.push(`README.md version badge must equal ${version}`)
  if (manifest.version !== version) violations.push(`package.json version must equal ${version}`)
  if (lock.version !== version || lock.packages?.[``]?.version !== version) {
    violations.push(`package-lock.json root versions must equal ${version}`)
  }

  const expectedProperties = [
    `<Version>${version}</Version>`,
    `<AssemblyVersion>${version}.0</AssemblyVersion>`,
    `<FileVersion>${version}.0</FileVersion>`,
    `<InformationalVersion>${version}</InformationalVersion>`
  ]
  if (!expectedProperties.every(property => msBuild.includes(property))) {
    violations.push(`src/core/Directory.Build.props versions must equal ${version}`)
  }
  if (sharedModule.trim() !== `export const productVersion = \`${version}\``) {
    violations.push(`packages/shared/src/productVersion.ts must equal ${version}`)
  }
  return violations
}

async function main() {
  const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), `..`)
  const violations = await checkFrontendVersion(frontendRoot)
  if (violations.length > 0) {
    for (const violation of violations) console.error(violation)
    process.exitCode = 1
    return
  }
  console.log(`Frontend product version is synchronized`)
}

const entryPoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (entryPoint) await main()