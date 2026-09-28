import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test, { type TestContext } from 'node:test'
import { Chivalry2InstallationService } from './chivalry2InstallationService'

async function createFixture(context: TestContext) {
  const root = await mkdtemp(join(tmpdir(), `spellbook-installations-`))
  context.after(() => rm(root, { recursive: true, force: true }))
  const steam = join(root, `Steam`)
  const epicManifestsPath = join(root, `Epic`, `Manifests`)
  const service = new Chivalry2InstallationService({
    findSteamPaths: async () => [steam],
    epicManifestsPath
  })

  async function file(path: string, contents = ``) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, contents)
  }

  async function epic(name: string, fields: Record<string, unknown> = {}) {
    const installLocation = join(root, name)
    await file(join(epicManifestsPath, `${name}.item`), JSON.stringify({
      AppName: `Peppermint`,
      DisplayName: `Chivalry 2`,
      InstallLocation: installLocation,
      LaunchExecutable: `Chivalry2-Win64-Shipping.exe`,
      bIsIncompleteInstall: false,
      ...fields
    }))
    return installLocation
  }

  async function steamInstall(library: string, fields: { appId?: string, stateFlags?: string } = {}) {
    await file(join(library, `steamapps`, `appmanifest_1824220.acf`), `
      "AppState"
      {
        "appid" "${fields.appId ?? `1824220`}"
        "name" "Chivalry 2"
        "StateFlags" "${fields.stateFlags ?? `4`}"
        "installdir" "Chivalry 2"
      }
    `)
    return join(library, `steamapps`, `common`, `Chivalry 2`)
  }

  return { root, steam, epicManifestsPath, service, file, epic, steamInstall }
}

test(`detects both editions using Epic metadata and a custom Steam library`, async context => {
  const fixture = await createFixture(context)
  const epic = await fixture.epic(`Epic game`)
  await fixture.file(join(epic, `Chivalry2-Win64-Shipping.exe`))
  const library = join(fixture.root, `Games on another drive`)
  await fixture.file(join(fixture.steam, `steamapps`, `libraryfolders.vdf`), `
    "libraryfolders"
    {
      "0" { "path" "${fixture.steam.replaceAll(`\\`, `\\\\`)}" }
      "1" { "path" "${library.replaceAll(`\\`, `\\\\`)}" }
    }
  `)
  const steam = await fixture.steamInstall(library)
  await fixture.file(join(steam, `TBL`, `Binaries`, `Win64`, `Chivalry2-Win64-Shipping.exe`))

  assert.deepEqual(await fixture.service.detect(), [`Epic`, `Steam`])
})

test(`detects Steam in its primary library without a library list`, async context => {
  const fixture = await createFixture(context)
  const steam = await fixture.steamInstall(fixture.steam)
  await fixture.file(join(steam, `TBL`, `Binaries`, `Win64`, `Chivalry2-Win64-Shipping.exe`))

  assert.deepEqual(await fixture.service.detect(), [`Steam`])
})

test(`detects legacy Steam library paths without treating app sizes as paths`, async context => {
  const fixture = await createFixture(context)
  const library = join(fixture.root, `Legacy library`)
  await fixture.file(join(fixture.steam, `steamapps`, `libraryfolders.vdf`), `
    "LibraryFolders" { "1" "${library.replaceAll(`\\`, `\\\\`)}" "1824220" "123456" }
  `)
  const steam = await fixture.steamInstall(library)
  await fixture.file(join(steam, `Chivalry2-Win64-Shipping.exe`))

  assert.deepEqual(await fixture.service.detect(), [`Steam`])
})

test(`ignores stale manifests whose game executables are missing`, async context => {
  const fixture = await createFixture(context)
  await fixture.epic(`Epic game`)
  await fixture.steamInstall(fixture.steam)

  assert.deepEqual(await fixture.service.detect(), [])
})

test(`ignores incomplete Epic installs and unrelated games even when their files exist`, async context => {
  const fixture = await createFixture(context)
  const incomplete = await fixture.epic(`Incomplete`, { bIsIncompleteInstall: true })
  const unrelated = await fixture.epic(`Another game`, { AppName: `AnotherGame`, DisplayName: `Another game` })
  for (const location of [incomplete, unrelated]) await fixture.file(join(location, `Chivalry2-Win64-Shipping.exe`))

  assert.deepEqual(await fixture.service.detect(), [])
})

test(`recognizes the Epic app identifier when its display name changes`, async context => {
  const fixture = await createFixture(context)
  const location = await fixture.epic(`Localized name`, { DisplayName: `A localized game title` })
  await fixture.file(join(location, `Chivalry2-Win64-Shipping.exe`))

  assert.deepEqual(await fixture.service.detect(), [`Epic`])
})

test(`skips malformed Epic records while detecting a valid record once`, async context => {
  const fixture = await createFixture(context)
  await fixture.file(join(fixture.epicManifestsPath, `broken.item`), `{broken json`)
  await fixture.file(join(fixture.epicManifestsPath, `null.item`), `null`)
  await fixture.epic(`Invalid fields`, { InstallLocation: 4, LaunchExecutable: null })
  const location = await fixture.epic(`Valid game`)
  await fixture.file(join(location, `Chivalry2-Win64-Shipping.exe`))
  const duplicate = await fixture.epic(`Duplicate game`)
  await fixture.file(join(duplicate, `Chivalry2-Win64-Shipping.exe`))

  assert.deepEqual(await fixture.service.detect(), [`Epic`])
})

test(`missing launcher folders produce no detected editions`, async context => {
  const fixture = await createFixture(context)

  assert.deepEqual(await fixture.service.detect(), [])
})

test(`a Steam lookup failure does not hide a valid Epic install`, async context => {
  const fixture = await createFixture(context)
  const location = await fixture.epic(`Epic game`)
  await fixture.file(join(location, `Chivalry2-Win64-Shipping.exe`))
  const service = new Chivalry2InstallationService({
    findSteamPaths: async () => { throw new Error(`registry unavailable`) },
    epicManifestsPath: fixture.epicManifestsPath
  })

  assert.deepEqual(await service.detect(), [`Epic`])
})

test(`does not accept a directory or an executable outside the Epic installation`, async context => {
  const fixture = await createFixture(context)
  const directory = await fixture.epic(`Directory game`)
  await mkdir(join(directory, `Chivalry2-Win64-Shipping.exe`), { recursive: true })
  await fixture.file(join(fixture.root, `Chivalry2-Win64-Shipping.exe`))
  await fixture.epic(`Escaping game`, { LaunchExecutable: `../Chivalry2-Win64-Shipping.exe` })

  assert.deepEqual(await fixture.service.detect(), [])
})

test(`Steam requires the matching app ID and a completed install`, async context => {
  const fixture = await createFixture(context)
  const location = await fixture.steamInstall(fixture.steam, { appId: `12345` })
  await fixture.file(join(location, `TBL`, `Binaries`, `Win64`, `Chivalry2-Win64-Shipping.exe`))
  assert.deepEqual(await fixture.service.detect(), [])

  await fixture.steamInstall(fixture.steam, { stateFlags: `2` })
  assert.deepEqual(await fixture.service.detect(), [])
})

test(`a later detection reflects removed game files`, async context => {
  const fixture = await createFixture(context)
  const location = await fixture.epic(`Epic game`)
  const executable = join(location, `Chivalry2-Win64-Shipping.exe`)
  await fixture.file(executable)
  assert.deepEqual(await fixture.service.detect(), [`Epic`])

  await rm(executable)
  assert.deepEqual(await fixture.service.detect(), [])
})
