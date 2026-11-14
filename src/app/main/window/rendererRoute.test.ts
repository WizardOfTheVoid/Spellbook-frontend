import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'
import type { Protocol } from 'electron'
import { installRendererProtocol, loadRendererRoute, registerRendererScheme } from './rendererRoute'

test(`loads Svelte routes through Vite in development and the private origin when packaged`, () => {
  const calls: string[] = []
  const window = {
    loadURL: (url: string) => {
      calls.push(url)
      return Promise.resolve()
    }
  }

  loadRendererRoute(window, `C:\\app\\out\\main`, `/toast`, `http://127.0.0.1:5173`)
  loadRendererRoute(window, `C:\\app\\out\\main`, `/anti-afk`)

  assert.deepEqual(calls, [
    `http://127.0.0.1:5173/#/toast`,
    `spellbook://renderer/#/anti-afk`
  ])
})

test(`registers the private origin with the privileges needed by Svelte bundles`, () => {
  let schemes: unknown
  const protocol = {
    registerSchemesAsPrivileged: (value: unknown) => { schemes = value }
  } as unknown as Pick<Protocol, 'registerSchemesAsPrivileged'>

  registerRendererScheme(protocol)

  assert.deepEqual(schemes, [{
    scheme: `spellbook`,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      codeCache: true
    }
  }])
})

test(`serves only files contained by the packaged renderer root`, async () => {
  const rendererRoot = await mkdtemp(join(tmpdir(), `spellbook-renderer-test-`))
  const fetched: string[] = []
  type RequestHandler = (request: { url: string }) => Promise<Response>
  let request: RequestHandler | undefined
  const protocol = {
    handle: (scheme: string, handler: RequestHandler) => {
      assert.equal(scheme, `spellbook`)
      request = handler
    }
  } as unknown as Pick<Protocol, 'handle'>
  const fetchFile = async (url: string) => {
    fetched.push(url)
    if (url.endsWith(`/broken.js`)) throw new Error(`Unreadable file`)
    return new Response(null, { status: 204 })
  }

  try {
    installRendererProtocol(protocol, fetchFile, rendererRoot)
    assert.ok(request)

    assert.equal((await request({ url: `spellbook://renderer/` })).status, 204)
    assert.equal((await request({ url: `spellbook://renderer/_app/entry.js` })).status, 204)
    assert.deepEqual(fetched, [
      pathToFileURL(join(rendererRoot, `index.html`)).toString(),
      pathToFileURL(join(rendererRoot, `_app/entry.js`)).toString()
    ])

    const fetchedBeforeRejections = fetched.length
    assert.equal((await request({ url: `spellbook://other/index.html` })).status, 404)
    assert.equal((await request({ url: `spellbook://renderer/%2E%2E%2Fsecret.txt` })).status, 404)
    assert.equal((await request({ url: `not a url` })).status, 404)
    assert.equal(fetched.length, fetchedBeforeRejections)
    assert.equal((await request({ url: `spellbook://renderer/broken.js` })).status, 404)
  } finally {
    await rm(rendererRoot, { recursive: true, force: true })
  }
})
