import { isAbsolute } from 'node:path'

export function steamManifestValue(source: string, key: string): string | undefined {
  for (const match of source.matchAll(/"([^"]+)"\s+"((?:[^"\\]|\\.)*)"/gu)) {
    if (match[1].toLowerCase() === key.toLowerCase()) return unescapeValue(match[2])
  }
  return undefined
}

export function steamLibraryPaths(source: string): string[] {
  return Array.from(source.matchAll(/"(?:path|\d+)"\s+"((?:[^"\\]|\\.)*)"/giu), match => unescapeValue(match[1]))
    .filter(isAbsolute)
}

function unescapeValue(value: string): string {
  return value.replace(/\\(["\\])/gu, `$1`)
}
