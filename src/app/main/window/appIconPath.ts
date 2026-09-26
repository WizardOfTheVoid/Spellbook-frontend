import { win32 } from 'node:path'

export type AppIconPathOptions = {
  isPackaged: boolean
  appPath: string
  resourcesPath: string
}

export function resolveAppIconPath({
  isPackaged,
  appPath,
  resourcesPath
}: AppIconPathOptions): string {
  return isPackaged
    ? win32.join(resourcesPath, `icon.ico`)
    : win32.join(appPath, `build`, `icon.ico`)
}
