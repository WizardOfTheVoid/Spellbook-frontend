import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { load } from 'js-yaml'

export async function verifyUpdateAssets(releaseRoot, expectedVersion) {
  const violations = []
  const reject = (code, path) => violations.push({ code, path })
  const installer = `SpellBook-Setup-${expectedVersion}.exe`
  try {
    const info = load(await readFile(resolve(releaseRoot, `latest.yml`), `utf8`))
    const bytes = await readFile(resolve(releaseRoot, installer))
    const sha512 = createHash(`sha512`).update(bytes).digest(`base64`)
    const file = info?.files?.[0]
    if (
      info?.version !== expectedVersion ||
      typeof info.forceUpdate !== `boolean` ||
      info.path !== installer ||
      info.sha512 !== sha512 ||
      !Array.isArray(info.files) || info.files.length !== 1 ||
      file?.url !== installer ||
      file.size !== bytes.length ||
      file.sha512 !== sha512
    ) {
      reject(`UPDATE_METADATA_MISMATCH`, `latest.yml`)
    }
  } catch {
    reject(`UPDATE_METADATA_INVALID`, `latest.yml`)
  }
  try {
    if (!(await readFile(resolve(releaseRoot, `${installer}.blockmap`))).length) throw new Error(`Empty blockmap`)
  } catch {
    reject(`UPDATE_BLOCKMAP_INVALID`, `${installer}.blockmap`)
  }
  const configPath = `win-unpacked/resources/app-update.yml`
  try {
    const config = load(await readFile(resolve(releaseRoot, configPath), `utf8`))
    const allowedKeys = new Set([`provider`, `owner`, `repo`, `updaterCacheDirName`])
    if (
      config?.provider !== `github` ||
      config.owner !== `WizardOfTheVoid` ||
      config.repo !== `Spellbook-frontend` ||
      Object.keys(config).some((key) => !allowedKeys.has(key))
    )
      reject(`UPDATE_PROVIDER_MISMATCH`, configPath)
  } catch {
    reject(`UPDATE_PROVIDER_INVALID`, configPath)
  }
  return violations
}
