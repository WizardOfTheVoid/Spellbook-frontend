import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionBuilder, buildAction } from './actionBuilder'
import { actionPriority } from './actionPriority'
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import { RequestIdFactory } from '../request-id-factory'

test(`producer request IDs remain unique when multiple Actions originate in the same millisecond`, context => {
  context.mock.method(Date, `now`, () => 123456789)
  const ids = new RequestIdFactory(`overlay`)
  const first = ids.next(`batch`)
  const second = ids.next(`batch`)
  assert.notEqual(first, second)
  assert.ok(first.length <= 96)
})

test(`structured commands normalize game text and preserve argument and delay semantics`, () => {
  const builder = new ActionBuilder()
  const commands = builder.batch([
    { commandType: `ban`, playfabId: ` PLAYER_1 `, hours: 7, message: `  Caf\u00e9 \u65e5\u672c\u8a9e  `, delayMs: 12 },
    { commandType: `server_message`, message: `Welcome`, delayMs: 34 },
    { commandType: `unban`, playfabId: `PLAYER_2`, message: null, delayMs: 56 }
  ])
  assert.deepEqual(commands.map(({ command, delayMs }) => [command, delayMs]), [
    [`BanById PLAYER_1 7 "Cafe \u65e5\u672c\u8a9e"`, 12], [`Serversay "Welcome"`, 34],
    ...[56, 0, 0, 0].map(delay => [`UnbanById PLAYER_2`, delay])
  ])
  assert.ok(commands.every(command => command.consoleKey === `NumpadSubtract`))
})

test(`raw commands retain caller text and valid raw unbans expand to four Commands`, () => {
  const builder = new ActionBuilder()
  assert.equal(builder.raw(`  Adminsay "Caf\u00e9"  `)[0]?.command, `Adminsay "Caf\u00e9"`)
  assert.deepEqual(builder.raw(`unBANbyid  PLAYER_1`).map(command => command.command), Array(4).fill(`UnbanById PLAYER_1`))
  assert.equal(builder.raw(`UnbanById invalid!`).length, 1)
})

test(`console keys are captured before enqueue and invalid bindings and arguments reject construction`, () => {
  let key: ConsoleKeyCode | null = `Backquote`
  const builder = new ActionBuilder(() => key)
  const first = builder.message(`admin`, `Hello`)
  key = `F6`
  assert.equal(first[0]?.consoleKey, `Backquote`)
  assert.equal(builder.message(`server`, `Hello`)[0]?.consoleKey, `F6`)
  key = `invalid` as ConsoleKeyCode
  assert.throws(() => builder.raw(`ListPlayers`), /console key/u)
  for (const message of [``, `double "quotes"`, `a`.repeat(181)]) {
    assert.throws(() => new ActionBuilder().message(`admin`, message))
  }
  assert.throws(() => new ActionBuilder().ban(`player`, 0, `reason`))
  assert.throws(() => new ActionBuilder().kick(`!`, `reason`))
})

test(`Action identity excludes submission IDs and includes target, author, priority and command execution payload`, () => {
  const commands = new ActionBuilder().raw(`ListPlayers`, { expectClipboard: true })
  const app = { processId: 42, windowHandle: `0x0000000000000001` }
  const options = { author: `system`, priority: `low` } as const
  const first = buildAction(commands, app, options)
  const second = buildAction(commands, app, options)
  assert.notEqual(first.id, second.id)
  assert.equal(first.key, second.key)
  assert.deepEqual(first.app, app)
  for (const candidate of [
    buildAction(commands, { ...app, processId: 43 }, options),
    buildAction(commands, app, { ...options, author: `user` }),
    buildAction(commands, app, { ...options, priority: `high` }),
    buildAction([{ ...commands[0]!, consoleKey: `F6` }], app, options),
    buildAction(new ActionBuilder().ban(`PLAYER_2`, 3, `reason`), app, options)
  ]) assert.notEqual(first.key, candidate.key)
  assert.throws(() => buildAction([{ type: `console`, command: `ListPlayers` } as never], app, options), /console key/u)
})

test(`user commands use normal priority in both Sentinel modes`, () => {
  const builder = new ActionBuilder()
  for (const sentinel of [false, true]) {
    assert.equal(actionPriority(`antiAfk`, [{ type: `keys`, presses: [{ virtualKey: 87, durationMs: 50 }] }], sentinel), `normal`)
    assert.equal(actionPriority(`user`, builder.ban(`PLAYER_1`, 1, `reason`), sentinel), `normal`)
    assert.equal(actionPriority(`user`, builder.message(`server`, `hello`), sentinel), `normal`)
    assert.equal(actionPriority(`listPlayers`, builder.raw(`ListPlayers`), sentinel), sentinel ? `high` : `low`)
    assert.equal(actionPriority(`user`, builder.raw(`listplayers`), sentinel), `normal`)
  }
})

test(`custom TTL changes lifetime without changing equivalent payload identity`, () => {
  const commands = new ActionBuilder().raw(`ListPlayers`)
  const app = { processId: 42, windowHandle: `0x1` }
  const options = { author: `system`, priority: `normal` } as const
  const short = buildAction(commands, app, { ...options, ttlMs: 50 })
  assert.equal(short.ttlMs, 50)
  assert.equal(short.key, buildAction(commands, app, options).key)
  for (const ttlMs of [0, -1, 0.5, NaN]) assert.throws(() => buildAction(commands, app, { ...options, ttlMs }))
})
