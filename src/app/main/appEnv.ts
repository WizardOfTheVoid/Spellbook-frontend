import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadDotenv } from 'dotenv'

export function loadAppEnv(
  env: NodeJS.ProcessEnv = process.env,
  workspaceDirectory = process.cwd(),
  resourcesDirectory = process.resourcesPath
): void {
  const envPaths = [
    resolve(workspaceDirectory, 'src/app/.env'),
    resourcesDirectory && resolve(resourcesDirectory, 'app/.env')
  ]
  for (const envPath of envPaths) {
    if (!envPath || !existsSync(envPath)) continue
    loadDotenv({
      path: envPath,
      processEnv: env,
      override: false,
      quiet: true
    })
  }
}
