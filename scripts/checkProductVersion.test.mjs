import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { checkFrontendVersion } from './checkProductVersion.mjs'

async function createFrontendFixture(t, overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), `spellbook-frontend-version-`))
  t.after(() => rm(root, { recursive: true, force: true }))
  const files = {
    'productVersion.json': `{\n  "version": "1.13.5"\n}\n`,
    'README.md': `# SpellBook\n\n<img src="https://img.shields.io/badge/version-1.13.5-f2bd2e" alt="Version 1.13.5">\n`,
    'package.json': `{\n  "version": "1.13.5"\n}\n`,
    'package-lock.json': `{\n  "version": "1.13.5",\n  "packages": { "": { "version": "1.13.5" } }\n}\n`,
    'src/core/Directory.Build.props': `<Project>\n  <PropertyGroup>\n    <Version>1.13.5</Version>\n    <AssemblyVersion>1.13.5.0</AssemblyVersion>\n    <FileVersion>1.13.5.0</FileVersion>\n    <InformationalVersion>1.13.5</InformationalVersion>\n  </PropertyGroup>\n</Project>\n`,
    'packages/shared/src/productVersion.ts': 'export const productVersion = `1.13.5`\n',
    ...overrides
  }
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(root, relativePath)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }
  return root
}

test(`accepts synchronized frontend version consumers`, async t => {
  const frontendRoot = await createFrontendFixture(t)

  assert.deepEqual(await checkFrontendVersion(frontendRoot), [])
})

test(`reports every drifted frontend version consumer`, async t => {
  const frontendRoot = await createFrontendFixture(t, {
    'README.md': `# SpellBook\n\n<img src="https://img.shields.io/badge/version-1.13.4-f2bd2e" alt="Version 1.13.4">\n`,
    'package.json': `{ "version": "1.13.4" }`,
    'package-lock.json': `{ "version": "1.13.5", "packages": { "": { "version": "1.13.4" } } }`,
    'src/core/Directory.Build.props': `<Project><Version>1.13.4</Version></Project>`,
    'packages/shared/src/productVersion.ts': 'export const productVersion = `1.13.4`\n'
  })

  const violations = await checkFrontendVersion(frontendRoot)

  assert.equal(violations.length, 5)
  assert.match(violations.join(`\n`), /README\.md/u)
  assert.match(violations.join(`\n`), /package\.json/u)
  assert.match(violations.join(`\n`), /package-lock\.json/u)
  assert.match(violations.join(`\n`), /Directory\.Build\.props/u)
  assert.match(violations.join(`\n`), /productVersion\.ts/u)
})