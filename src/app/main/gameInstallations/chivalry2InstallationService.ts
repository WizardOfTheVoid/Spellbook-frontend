import { readFile, readdir, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { steamLibraryPaths, steamManifestValue } from './steamManifest'
import { findWindowsSteamPaths } from './windowsSteamPaths'

export type Chivalry2Edition = `Epic` | `Steam`

type Chivalry2InstallationOptions = {
  findSteamPaths?: () => Promise<string[]>
  epicManifestsPath?: string
}

export class Chivalry2InstallationService {
  constructor(private readonly options: Chivalry2InstallationOptions = {}) {}

  async detect(): Promise<Chivalry2Edition[]> {
    const [epic, steam] = await Promise.all([this.hasEpicInstallation(), this.hasSteamInstallation()])
    return [...(epic ? [`Epic` as const] : []), ...(steam ? [`Steam` as const] : [])]
  }

  private async hasEpicInstallation(): Promise<boolean> {
    const manifestsPath = this.options.epicManifestsPath ?? (process.env.ProgramData
      ? join(process.env.ProgramData, `Epic`, `EpicGamesLauncher`, `Data`, `Manifests`)
      : undefined)
    if (!manifestsPath) return false

    let records: string[]
    try {
      records = await readdir(manifestsPath)
    } catch {
      return false
    }

    for (const record of records.filter(name => name.toLowerCase().endsWith(`.item`))) {
      const contents = await readText(join(manifestsPath, record))
      if (!contents) continue
      let manifest: Record<string, unknown> | null
      try {
        manifest = JSON.parse(contents)
      } catch {
        continue
      }
      if (!manifest || typeof manifest !== `object` || Array.isArray(manifest)) continue
      if (manifest.AppName !== `Peppermint` && manifest.DisplayName !== `Chivalry 2`) continue
      if (manifest.bIsIncompleteInstall !== false) continue
      if (typeof manifest.InstallLocation !== `string` || typeof manifest.LaunchExecutable !== `string`) continue
      if (await executableExists(manifest.InstallLocation, manifest.LaunchExecutable)) return true
    }
    return false
  }

  private async hasSteamInstallation(): Promise<boolean> {
    let steamPaths: string[]
    try {
      steamPaths = await (this.options.findSteamPaths ?? findWindowsSteamPaths)()
    } catch {
      return false
    }
    const libraries = new Set(steamPaths.filter(isAbsolute))
    for (const steamPath of libraries) {
      const contents = await readText(join(steamPath, `steamapps`, `libraryfolders.vdf`))
      if (contents) for (const library of steamLibraryPaths(contents)) libraries.add(library)
    }

    for (const library of libraries) {
      const contents = await readText(join(library, `steamapps`, `appmanifest_1824220.acf`))
      if (!contents || steamManifestValue(contents, `appid`) !== `1824220`) continue
      if (!(Number(steamManifestValue(contents, `StateFlags`)) & 4)) continue
      const directory = steamManifestValue(contents, `installdir`)
      if (!directory || isAbsolute(directory)) continue
      const commonPath = join(library, `steamapps`, `common`)
      for (const binaryPath of [
        join(directory, `TBL`, `Binaries`, `Win64`, `Chivalry2-Win64-Shipping.exe`),
        join(directory, `Chivalry2-Win64-Shipping.exe`)
      ]) {
        if (await executableExists(commonPath, binaryPath)) return true
      }
    }
    return false
  }
}
async function readText(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, `utf8`)
  } catch {
    return undefined
  }
}

async function executableExists(installPath: string, executable: string): Promise<boolean> {
  if (!isAbsolute(installPath) || !executable.toLowerCase().endsWith(`.exe`)) return false
  const binaryPath = resolve(installPath, executable)
  const withinInstall = relative(installPath, binaryPath)
  if (withinInstall === `..` || withinInstall.startsWith(`..${sep}`) || isAbsolute(withinInstall)) return false
  try {
    return (await stat(binaryPath)).isFile()
  } catch {
    return false
  }
}
