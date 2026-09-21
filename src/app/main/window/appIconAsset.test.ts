import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), `../../../..`)
const faviconPath = resolve(rootDirectory, `src/app/renderer/static/favicon.png`)
const faviconSourcePath = resolve(rootDirectory, `src/app/renderer/src/lib/resources/logo-pos-transp-padding.png`)
const iconPath = resolve(rootDirectory, `build/icon.ico`)

test(`ships the approved positive logo as the renderer favicon`, async () => {
  const [favicon, source] = await Promise.all([
    readFile(faviconPath),
    readFile(faviconSourcePath)
  ])

  assert.deepEqual(favicon, source)
})

test(`ships a valid Windows icon with the required sizes`, async () => {
  const icon = await readFile(iconPath)

  assert.equal(icon.readUInt16LE(0), 0)
  assert.equal(icon.readUInt16LE(2), 1)

  const entryCount = icon.readUInt16LE(4)
  assert.ok(entryCount >= 4)

  const sizes = new Set<number>()
  for (let index = 0; index < entryCount; index += 1) {
    const offset = 6 + (index * 16)
    const width = icon[offset] || 256
    const height = icon[offset + 1] || 256
    const bytesInResource = icon.readUInt32LE(offset + 8)
    const imageOffset = icon.readUInt32LE(offset + 12)

    assert.equal(width, height)
    assert.ok(bytesInResource > 0)
    assert.ok(imageOffset >= 6 + (entryCount * 16))
    assert.ok(imageOffset + bytesInResource <= icon.length)
    sizes.add(width)
  }

  for (const size of [16, 32, 64, 256]) assert.ok(sizes.has(size))
})
