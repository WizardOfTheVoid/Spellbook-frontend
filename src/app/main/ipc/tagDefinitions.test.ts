import assert from 'node:assert/strict'
import test from 'node:test'
import { CoreIpcHandlers } from './core-ipc-handlers'
import { ActionBuilder } from '../core/actionBuilder'
import { defaultTagDefinitions } from '@spellbook/shared/actions/tagTypeDefinitions'
import type { CoreCommand } from '../../shared/coreAction'

test(`local profile execution loads current definitions before preparing native commands`, async () => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>()
  const native: CoreCommand[][] = []
  const priorities: string[] = []
  let fail = false
  new CoreIpcHandlers(
    { handle: (name: string, callback: (...args: any[]) => Promise<any>) => handlers.set(name, callback) } as never,
    { commands: new ActionBuilder(),
      getServer: async (path: string) => {
        assert.equal(path, `/definitions/tag-types`)
        if (fail) return { ok: false, data: null }
        return { ok: true, data: { ok: true, data: defaultTagDefinitions.map(row => row.group === `action` && row.slug === `warn` ? { ...row, pastTense: `cautioned` } : row) } }
      },
      executeAction: async (commands: CoreCommand[], options: { priority: string }) => { native.push(commands); priorities.push(options.priority); return { ok: true } }
    } as never,
    {} as never, {} as never,
    { get: () => ({ gameServerId: 7, observedAt: new Date().toISOString() }), subscribe: () => () => {} } as never,
    { next: () => `message-test` } as never,
    { beginGameCommandBatch: () => null, endGameCommandBatch: () => {} } as never,
    {} as never, {} as never
  ).register()
  const run = handlers.get(`core:actionRecipe`)!
  const payload = { gameServerId: 7, target: { type: `player`, playfabId: `PLAYER_1` },
    context: { admin: `Admin`, serverName: `Server`, player: { name: `Alice`, playfabId: `PLAYER_1` }, offenses: 2 },
    recipe: { label: `Warn`, actionDomain: `player`, delayMs: 0, isEnabled: true, blockOnMissingVariables: true, commands: [
      { commandType: `warn`, sortOrder: 0, delayMs: 0, offenseType: `ffa`, message: `Warning` },
      { commandType: `admin_message`, sortOrder: 1, delayMs: 0, message: `[user] was [offense_type_pt]. [offenses_alt] offense.` }
    ] } }
  await run({}, payload)
  assert.equal((native[0][1] as { command: string }).command, `Adminsay "Alice was cautioned. 2nd offense."`)
  payload.recipe.commands[0].commandType = `ban`
  await run({}, payload)
  assert.deepEqual(priorities, [`normal`, `normal`])
  fail = true
  await assert.rejects(run({}, payload), /definitions/u)
  assert.equal(native.length, 2)
})
