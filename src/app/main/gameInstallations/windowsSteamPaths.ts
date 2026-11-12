import { execFile } from 'node:child_process'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const steamRegistryValues = [
  { key: `HKCU\\Software\\Valve\\Steam`, value: `SteamPath` },
  { key: `HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam`, value: `InstallPath` },
  { key: `HKLM\\SOFTWARE\\Valve\\Steam`, value: `InstallPath` }
]

export async function findWindowsSteamPaths(): Promise<string[]> {
  if (process.platform !== `win32`) return []
  const registered = await Promise.all(steamRegistryValues.map(async ({ key, value }) => {
    try {
      const { stdout } = await execute(`reg.exe`, [`query`, key, `/v`, value], { windowsHide: true, timeout: 2_000 })
      const path = stdout.match(/REG_(?:EXPAND_)?SZ\s+([^\r\n]+)/u)?.[1].trim()
      return path?.replace(/%([^%]+)%/gu, (match, variable: string) => process.env[variable] ?? match)
    } catch {
      return undefined
    }
  }))
  const defaults = [process.env[`ProgramFiles(x86)`], process.env.ProgramFiles]
    .filter((path): path is string => Boolean(path))
    .map(path => join(path, `Steam`))
  return [...new Set([...registered, ...defaults].filter((path): path is string => Boolean(path && isAbsolute(path))))]
}
