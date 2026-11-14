import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAppIconPath } from './appIconPath'

test(`resolves the development icon from the application directory`, () => {
  assert.equal(
    resolveAppIconPath({
      isPackaged: false,
      appPath: `C:\\SpellBook`,
      resourcesPath: `C:\\SpellBook\\resources`
    }),
    `C:\\SpellBook\\build\\icon.ico`
  )
})

test(`resolves the packaged icon from the resources directory`, () => {
  assert.equal(
    resolveAppIconPath({
      isPackaged: true,
      appPath: `C:\\SpellBook`,
      resourcesPath: `C:\\SpellBook\\resources`
    }),
    `C:\\SpellBook\\resources\\icon.ico`
  )
})
