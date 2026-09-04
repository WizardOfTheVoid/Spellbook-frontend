import assert from 'node:assert/strict'
import test from 'node:test'

type AppUpdateServiceInstance = {
  check(): Promise<string | null>
  openLatestRelease(): Promise<void>
}

type AppUpdateServiceConstructor = new (
  currentVersion: string,
  fetchRelease: typeof fetch,
  openExternal: (url: string) => Promise<unknown>
) => AppUpdateServiceInstance

test(`returns only a newer stable GitHub release`, async () => {
  const AppUpdateService = await loadAppUpdateService()

  for (const [tag, expected] of [
    [`v1.0.11`, `1.0.11`],
    [`v1.0.10`, null],
    [`v1.0.9`, null],
  ] as const) {
    const service = new AppUpdateService(
      `1.0.10`,
      async () => Response.json({ tag_name: tag }),
      async () => undefined,
    )

    assert.equal(await service.check(), expected)
  }
})

test(`requests the public mirror latest-release API with a bounded request`, async () => {
  const AppUpdateService = await loadAppUpdateService()
  const requests: Array<{ url: string, init?: RequestInit }> = []
  const service = new AppUpdateService(
    `1.0.10`,
    async (input, init) => {
      requests.push({ url: String(input), init })
      return Response.json({ tag_name: `v1.0.11` })
    },
    async () => undefined,
  )

  await service.check()

  assert.equal(requests.length, 1)
  assert.equal(
    requests[0]?.url,
    `https://api.github.com/repos/WizardOfTheVoid/Spellbook-frontend/releases/latest`,
  )
  assert.equal(requests[0]?.init?.headers instanceof Headers, true)
  assert.equal(requests[0]?.init?.signal instanceof AbortSignal, true)
})

test(`rejects failed and malformed release responses`, async () => {
  const AppUpdateService = await loadAppUpdateService()

  for (const response of [
    new Response(``, { status: 429 }),
    Response.json({ tag_name: `next` }),
    Response.json({}),
  ]) {
    const service = new AppUpdateService(
      `1.0.10`,
      async () => response,
      async () => undefined,
    )
    await assert.rejects(() => service.check(), /release/u)
  }
})

test(`opens only the fixed public mirror release page`, async () => {
  const AppUpdateService = await loadAppUpdateService()
  const opened: string[] = []
  const service = new AppUpdateService(
    `1.0.10`,
    async () => Response.json({ tag_name: `v1.0.11` }),
    async url => { opened.push(url) },
  )

  await service.openLatestRelease()

  assert.deepEqual(opened, [
    `https://github.com/WizardOfTheVoid/Spellbook-frontend/releases/latest`,
  ])
})

async function loadAppUpdateService(): Promise<AppUpdateServiceConstructor> {
  const modulePath = `./appUpdateService`
  const module = await import(modulePath).catch(() => ({}))
  const AppUpdateService = Reflect.get(module, `AppUpdateService`)
  assert.equal(typeof AppUpdateService, `function`)
  return AppUpdateService as AppUpdateServiceConstructor
}
