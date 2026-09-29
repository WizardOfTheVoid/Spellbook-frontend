import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

for (const name of [`app`, `debug`]) {
  const exposed = new Map()
  const calls = []
  const electron = {
    contextBridge: { exposeInMainWorld: (key, value) => exposed.set(key, value) },
    ipcRenderer: {
      invoke: async (...args) => { calls.push(args) }, send: () => undefined,
      on: () => undefined, removeListener: () => undefined
    }
  }
  const path = fileURLToPath(new URL(`../out/preload/index.js`, import.meta.url))
  runInNewContext(await readFile(path, `utf8`), {
    require: module => {
      if (module === `electron`) return electron
      throw new Error(`Sandbox preload cannot load ${module}`)
    },
    console, process: { contextIsolated: true, argv: name === `debug` ? [`--spellbook-debug-observer`] : [] }, Buffer, setTimeout, clearTimeout
  }, { filename: path })
  const debug = exposed.get(`chivDebug`)
  assert.equal(typeof debug?.onState, `function`, `${name} must expose Debug observation`)
  assert.equal(typeof debug?.getState, `function`)
  if (name === `app`) {
    assert.equal(typeof exposed.get(`chivCore`)?.meta, `function`)
    await debug.run(2)
    assert.equal(calls[0][0], `debug:control`)
    assert.equal(calls[0][1], `run`)
    assert.equal(calls[0][2][0], 2)
    const input = { claimServerIds: [3], unclaimServerIds: [4] }
    await exposed.get(`chivServer`).teams.updateServers(8, input)
    assert.equal(calls[1][0], `server:teams:servers:update`)
    assert.equal(calls[1][1].teamId, 8)
    assert.equal(calls[1][1].input, input)
  } else {
    assert.equal(`run` in debug, false, `HUD must expose observation only`)
    assert.equal(exposed.size, 1, `HUD must not expose other app APIs`)
  }
}
console.log(`Sandboxed preload bundles verified`)
