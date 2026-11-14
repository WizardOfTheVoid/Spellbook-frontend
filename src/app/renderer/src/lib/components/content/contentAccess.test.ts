import assert from 'node:assert/strict'
import test from 'node:test'

test(`Content requires an active superadmin or an explicit Release creation grant`, async () => {
  const module = await import(`./contentAccess`).catch(() => ({}))
  const canOpen = Reflect.get(module, `canOpenContent`)
  assert.equal(typeof canOpen, `function`)
  for (const [user, expected] of [
    [null, false], [undefined, false],
    [{ isActive: true, isSuperadmin: true, releaseCreationEnabled: false }, true],
    [{ isActive: true, isSuperadmin: false, releaseCreationEnabled: true }, true],
    [{ isActive: true, isSuperadmin: false, releaseCreationEnabled: false }, false],
    [{ isActive: false, isSuperadmin: true, releaseCreationEnabled: true }, false],
    [{ isActive: true, isSuperadmin: false }, false]
  ] as const) assert.equal(canOpen(user), expected)
})
