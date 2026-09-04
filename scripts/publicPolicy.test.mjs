import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { inspectPublicTree } from './publicPolicy.mjs'

async function createPublicFixture(t, extras = {}) {
  const root = await mkdtemp(join(tmpdir(), `spellbook-public-policy-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const required = {
    'README.md': `# SpellBook`,
    'LICENSE.md': `PolyForm Noncommercial License 1.0.0`,
    'NOTICE.md': `# SpellBook\n\nCopyright 2026 Magic Trashcan`,
    'THIRD_PARTY_NOTICES.md': `# Third-Party Notices`,
    'package.json': `{ "name": "spellbook" }`,
    'package-lock.json': `{ "name": "spellbook" }`,
    'productVersion.json': `{ "version": "1.0.0" }`,
    'src/app/.env': `GAME_ACTIVITY_RECHECK_MS=550`,
    'src/app/index.ts': `export {}`,
    'src/core/CoreHost/.env': `CORE__PORT=48125`,
    'src/core/CoreHost/Program.cs': `public class Program {}`,
    'packages/shared/src/productVersion.ts': 'export const productVersion = `1.0.0`',
    ...extras
  }
  for (const [relativePath, contents] of Object.entries(required)) {
    const path = join(root, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  return root
}

test(`accepts the required public project surface`, async t => {
  assert.deepEqual(await inspectPublicTree(await createPublicFixture(t)), [])
})

test(`rejects private paths, links, escaping imports, and secrets`, async t => {
  const root = await createPublicFixture(t, {
    'src/app/leak.ts': `import '../../../backend/src/server/index.js'`,
    '.env': `TOKEN=real-looking-secret-value`,
    'server/structure.sql': `CREATE TABLE private_data (id int)`
  })
  await writeFile(join(root, `outside.txt`), `outside`)
  await symlink(join(root, `outside.txt`), join(root, `linked.txt`), `file`)

  const codes = (await inspectPublicTree(root)).map(item => item.code)
  assert.ok(codes.includes(`PRIVATE_PATH`))
  assert.ok(codes.includes(`ESCAPING_IMPORT`))
  assert.ok(codes.includes(`ENV_FILE`))
  assert.ok(codes.includes(`LINK`))
})

test(`requires every public project root`, async t => {
  const root = await createPublicFixture(t)
  await rm(join(root, `NOTICE.md`))

  assert.ok((await inspectPublicTree(root)).some(item => item.code === `REQUIRED_PATH_MISSING`))
})
