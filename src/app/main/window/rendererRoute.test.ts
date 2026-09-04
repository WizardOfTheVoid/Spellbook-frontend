import assert from 'node:assert/strict'
import test from 'node:test'
import { loadRendererRoute } from './rendererRoute'

test(`loads Svelte routes through hashes in development and packaged Electron`, () => {
  const calls: unknown[][] = []
  const window = {
    loadURL: (...args: unknown[]) => {
      calls.push([`url`, ...args])
      return Promise.resolve()
    },
    loadFile: (...args: unknown[]) => {
      calls.push([`file`, ...args])
      return Promise.resolve()
    }
  }

  loadRendererRoute(window, `C:\\app\\out\\main`, `/toast`, `http://127.0.0.1:5173`)
  loadRendererRoute(window, `C:\\app\\out\\main`, `/anti-afk`)

  assert.deepEqual(calls, [
    [`url`, `http://127.0.0.1:5173/#/toast`],
    [`file`, `C:\\app\\out\\renderer\\index.html`, { hash: `/anti-afk` }]
  ])
})
