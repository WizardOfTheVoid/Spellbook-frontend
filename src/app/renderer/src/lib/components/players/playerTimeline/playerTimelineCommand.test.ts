import assert from 'node:assert/strict'
import test from 'node:test'
import { splitTimelineCommand } from './playerTimelineCommand'

test(`raw commands separate the name without changing parameter text`, () => {
  const parameters = `"Hello <all> & friends"  😀`
  assert.deepEqual(splitTimelineCommand(`Serversay ${parameters}`), { name: `Serversay`, parameters })
  assert.deepEqual(splitTimelineCommand(`ListPlayers`), { name: `ListPlayers`, parameters: `` })
})

test(`saved messages use their command name and retain the complete message`, () => {
  const parameters = `  Hello world\n[Adminsay] "quoted"`
  assert.deepEqual(splitTimelineCommand(parameters, `serversay`), { name: `serversay`, parameters })
})
