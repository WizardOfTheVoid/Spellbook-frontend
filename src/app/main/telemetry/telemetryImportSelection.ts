import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, win32 } from 'node:path'
import { isRecord } from '../../shared/telemetry/telemetryValidation'

export type TelemetryImportSelection = { files: string[]; manifest?: string }

export async function resolveTelemetryImport(selected: string): Promise<TelemetryImportSelection> {
  selected = resolve(selected)
  const folder = dirname(selected)
  const name = basename(selected).toLowerCase()
  const packet = extname(selected).toLowerCase() === `.pcapng`
  let manifest: string | undefined
  if ([`capture.json`, `manifest.json`].includes(name)) manifest = selected
  else if (packet) {
    const candidate = basename(folder).toLowerCase() === `packets`
      ? join(dirname(folder), `manifest.json`)
      : join(folder, `capture.json`)
    if (await exists(candidate)) manifest = candidate
  } else throw new Error(`Select capture.json, manifest.json or one PCAPNG segment`)
  if (!manifest) return { files: [selected] }
  if ((await stat(manifest)).size > 65536) throw new Error(`Recording metadata is too large`)
  let metadata: unknown
  try {
    metadata = JSON.parse((await readFile(manifest, `utf8`)).replace(/^\uFEFF/, ``))
  } catch {
    throw new Error(`Cannot read recording metadata in ${basename(manifest)}`)
  }
  if (!isRecord(metadata)) throw new Error(`Invalid recording metadata`)
  const native = basename(manifest).toLowerCase() === `manifest.json`
  if (native && [`starting`, `recording`, `stopping`].includes(String(metadata.state)))
    throw new Error(`Stop and save this recording before importing it`)
  const root = dirname(manifest)
  const packetFolder = native ? join(root, `packets`) : root
  let names: string[]
  if (native) names = (await readdir(packetFolder)).filter(name => /^\d+\.pcapng$/i.test(name))
  else {
    if (!Array.isArray(metadata.pcapFiles) || !metadata.pcapFiles.every(path =>
      typeof path === `string` && path.toLowerCase().endsWith(`.pcapng`)))
      throw new Error(`capture.json must list its packet segments`)
    // Moved recordings retain old absolute paths. Resolve only names in this recording's folder.
    names = metadata.pcapFiles.map(path => win32.basename(path))
  }
  if (!names.length || names.length > 128) throw new Error(`Recording must contain 1–128 packet segments`)
  if (new Set(names.map(name => name.toLowerCase())).size !== names.length)
    throw new Error(`Recording metadata lists duplicate packet segments`)
  names.sort((a, b) => a.localeCompare(b, `en`, { numeric: true }))
  const files = names.map(name => join(packetFolder, name))
  if (packet && !files.some(file => file.toLowerCase() === selected.toLowerCase()))
    throw new Error(`This packet file does not belong to the adjacent recording metadata`)
  const realRoot = await realpath(root)
  const realPacketFolder = await realpath(packetFolder)
  if (native && dirname(realPacketFolder).toLowerCase() !== realRoot.toLowerCase())
    throw new Error(`Packet folder must be inside the recording folder`)
  for (const file of files) {
    if (!await exists(file)) throw new Error(`Missing packet segment: ${basename(file)}`)
    if (!(await stat(file)).isFile() ||
      dirname(await realpath(file)).toLowerCase() !== realPacketFolder.toLowerCase())
      throw new Error(`Packet segment must be a file inside the recording folder`)
  }
  return { files, manifest }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === `ENOENT`) return false
    throw error
  }
}
