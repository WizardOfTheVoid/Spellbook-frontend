import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

test(`application metadata and renderer surfaces identify SpellBook`, async () => {
  const [packageSource, packageLockSource, documentSource, startupOverlaySource] = await Promise.all([
    readFile(resolve(rootDirectory, `package.json`), `utf8`),
    readFile(resolve(rootDirectory, `package-lock.json`), `utf8`),
    readFile(resolve(rootDirectory, `src/app/renderer/src/app.html`), `utf8`),
    readFile(resolve(rootDirectory, `src/app/renderer/src/lib/components/auth/StartupOverlay.svelte`), `utf8`)
  ])
  const packageJson = JSON.parse(packageSource)
  const packageLock = JSON.parse(packageLockSource)

  assert.equal(packageJson.name, `spellbook`)
  assert.equal(packageJson.author, `Magic Trashcan`)
  assert.equal(packageJson.build.appId, `com.magictrashcan.spellbook`)
  assert.equal(packageJson.build.productName, `SpellBook`)
  assert.equal(packageJson.build.win.executableName, `SpellBook`)
  assert.equal(packageJson.build.copyright, `Copyright © 2026 Magic Trashcan`)
  assert.equal(packageLock.name, `spellbook`)
  assert.equal(packageLock.packages[``].name, `spellbook`)
  assert.match(documentSource, /<title>SpellBook<\/title>/)
  assert.match(documentSource, /<link rel="icon" type="image\/png" href="%sveltekit\.assets%\/favicon\.png" \/>/)
  assert.match(startupOverlaySource, /<small>by Magic Trashcan<\/small>/)
})
