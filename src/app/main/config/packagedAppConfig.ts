import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type PackagedAppConfig = {
  serverBaseUrl: string
}

export function parsePackagedAppConfig(value: unknown): PackagedAppConfig {
  if (!value || typeof value !== `object` || Array.isArray(value)) {
    throw new Error(`Packaged configuration must contain only serverBaseUrl`)
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== 1 || typeof record.serverBaseUrl !== `string`) {
    throw new Error(`Packaged configuration must contain only serverBaseUrl`)
  }

  let url: URL
  try {
    url = new URL(record.serverBaseUrl)
  } catch {
    throw new Error(`Packaged configuration requires an HTTPS Server URL ending in /v1`)
  }
  const pathname = url.pathname.replace(/\/+$/u, ``)
  if (url.protocol !== `https:` || url.username || url.password || url.search || url.hash ||
      !pathname.endsWith(`/v1`)) {
    throw new Error(`Packaged configuration requires an HTTPS Server URL ending in /v1`)
  }
  url.pathname = pathname
  return { serverBaseUrl: url.toString().replace(/\/$/u, ``) }
}

export function readPackagedAppConfig(resourcesPath: string): PackagedAppConfig {
  const path = resolve(resourcesPath, `app-config.json`)
  let source: string
  try {
    source = readFileSync(path, `utf8`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === `ENOENT`) {
      throw new Error(`PRODUCTION_CONFIG_MISSING`)
    }
    throw error
  }

  try {
    return parsePackagedAppConfig(JSON.parse(source))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Packaged configuration contains invalid JSON`)
    throw error
  }
}