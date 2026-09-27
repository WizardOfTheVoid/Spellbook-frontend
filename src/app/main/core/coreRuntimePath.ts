import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'

export function resolveCoreExecutable(resourcesPath: string): string {
  const coreDirectory = resolve(resourcesPath, `core`)
  const executable = join(coreDirectory, `SpellBook.CoreHost.exe`)
  if (!existsSync(executable)) {
    throw new Error(`Packaged Core executable does not exist`)
  }

  const actualDirectory = realpathSync(coreDirectory)
  const actualExecutable = realpathSync(executable)
  const relativePath = relative(actualDirectory, actualExecutable)
  if (relativePath === `` || isAbsolute(relativePath) || relativePath.startsWith(`..`)) {
    throw new Error(`Packaged Core executable escapes packaged Core resources`)
  }
  return executable
}