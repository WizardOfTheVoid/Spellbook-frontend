import assert from 'node:assert/strict'
import test from 'node:test'
import { CommandHistoryMatcher } from './commandHistoryMatcher'
import type { ConsoleSubmission } from '../../shared/commandHistory/commandHistory'

const receipt = (sequence: number, command: string, submittedAtUtc = 9_000): ConsoleSubmission => ({
  sequence, command, submittedAtUtc: new Date(submittedAtUtc).toISOString(), ageMs: 1_000,
  actionId: `action`, commandIndex: sequence - 1, author: `system`, appProcessId: 11, gameProcessId: 22
})

function fixture() {
  let now = 0
  const matcher = new CommandHistoryMatcher(() => now)
  const accept = (history: string[], receipts: ConsoleSubmission[] = [], started = 10_000) => matcher.accept({
    history, readStartedAtUtc: started, readCompletedAtUtc: started + 100
  }, receipts)
  return { matcher, accept, advance: (milliseconds: number) => { now += milliseconds } }
}

test(`baseline stays unknown and an exact submitted command matches without changing its arguments`, () => {
  const f = fixture()
  assert.equal(f.accept([`old`], [receipt(1, `old`)])[0].origin, `unknown`)
  const rows = f.accept([`old`, `Serversay "a # ; value"`], [receipt(2, `Serversay "a # ; value"`)])
  assert.equal(rows[0].origin, `unknown`)
  assert.equal(rows[1].origin, `spellbook`)
  assert.equal(rows[1].command, `Serversay "a # ; value"`)
  assert.equal(rows[1].info, `"a # ; value"`)
  assert.equal(rows[1].submission?.author, `system`)
})

test(`unmatched new commands become outside only after the grace period and another accepted read`, () => {
  const f = fixture()
  f.accept([`old`])
  assert.equal(f.accept([`old`, `manual`])[1].origin, `pending`)
  f.advance(2_999)
  assert.equal(f.accept([`old`, `manual`])[1].origin, `pending`)
  f.advance(1)
  assert.equal(f.accept([`old`, `manual`])[1].origin, `external`)
})

test(`receipt multiplicity and submission order cannot misattribute identical or reversed occurrences`, () => {
  const f = fixture()
  f.accept([`old`])
  const repeated = f.accept([`old`, `same`, `same`], [receipt(1, `same`)])
  assert.deepEqual(repeated.slice(1).map(row => row.origin), [`unknown`, `unknown`])
  const other = fixture()
  other.accept([`old`])
  assert.deepEqual(other.accept([`old`, `second`, `first`], [receipt(1, `first`), receipt(2, `second`)])
    .slice(1).map(row => row.origin), [`unknown`, `unknown`])
})

test(`one receipt is consumed once while rotation preserves known row identity`, () => {
  const f = fixture()
  f.accept([`old`, `kept`])
  const first = f.accept([`kept`, `same`], [receipt(1, `same`)])
  const second = f.accept([`same`, `same`], [receipt(1, `same`)])
  assert.equal(second[0].id, first[1].id)
  assert.equal(second[0].origin, `spellbook`)
  assert.equal(second[1].origin, `pending`)
  f.advance(3_000)
  assert.equal(f.accept([`same`, `same`], [receipt(1, `same`)])[1].origin, `external`)
})

test(`a receipt during the read is ambiguous and a later submission cannot claim an earlier observation`, () => {
  const f = fixture()
  f.accept([`old`])
  assert.equal(f.accept([`old`, `same`], [receipt(1, `same`, 10_050)])[1].origin, `unknown`)
  const other = fixture()
  other.accept([`old`])
  assert.equal(other.accept([`old`, `same`], [receipt(1, `same`, 10_200)])[1].origin, `pending`)
  other.advance(3_000)
  assert.equal(other.accept([`old`, `same`], [receipt(1, `same`, 10_200)])[1].origin, `external`)
})

test(`late eligible receipts resolve pending or inferred rows and stale plausible matches stay unknown`, () => {
  const f = fixture()
  f.accept([`old`])
  f.accept([`old`, `late`])
  f.advance(3_000)
  assert.equal(f.accept([`old`, `late`])[1].origin, `external`)
  assert.equal(f.accept([`old`, `late`], [{ ...receipt(1, `late`), ageMs: 4_000 }])[1].origin, `spellbook`)
  const other = fixture()
  other.accept([`old`])
  assert.equal(other.accept([`old`, `late`], [{ ...receipt(1, `late`, 3_000), ageMs: 7_000 }])[1].origin, `unknown`)
})

test(`truncated reads never replace the good baseline and restored contents create no outside occurrences`, () => {
  const f = fixture()
  const original = f.accept([`one`, `two`, `three`])
  assert.deepEqual(f.accept([`one`]), original)
  f.advance(5_000)
  assert.deepEqual(f.accept([`one`]), original)
  assert.ok(f.matcher.recoveryReason)
  assert.deepEqual(f.accept([`one`, `two`, `three`]), original)
  assert.equal(f.matcher.recoveryReason, ``)
})

test(`unexplained rewrites need stable confirmation and reset cannot highlight old history`, () => {
  const f = fixture()
  f.accept([`one`, `two`])
  assert.deepEqual(f.accept([`different`]).map(row => row.command), [`one`, `two`])
  assert.deepEqual(f.accept([`different`]).map(row => row.origin), [`unknown`])
  f.matcher.reset()
  assert.deepEqual(f.accept([`different`, `old manual`]).map(row => row.origin), [`unknown`, `unknown`])
})

test(`submission order remains consistent across separate history observations`, () => {
  const f = fixture()
  f.accept([`old`])
  const receipts = [receipt(1, `first`), receipt(2, `second`)]
  assert.equal(f.accept([`old`, `second`], receipts)[1].origin, `spellbook`)
  const rows = f.accept([`old`, `second`, `first`], receipts)
  assert.deepEqual(rows.slice(1).map(row => row.origin), [`unknown`, `unknown`])
})

test(`a stable rewrite baseline keeps receipts for commands absent from that snapshot`, () => {
  const f = fixture()
  f.accept([`old`])
  f.accept([`rewritten`])
  const incoming = [receipt(1, `incoming`, 10_050)]
  f.accept([`rewritten`], incoming)
  assert.equal(f.accept([`rewritten`, `incoming`], incoming, 11_000)[1].origin, `spellbook`)
})

test(`moving a repeated command to the end preserves retained origins and detects a new manual command`, () => {
  const f = fixture()
  f.accept([`old`, `ListPlayers`])
  const first = f.accept([`old`, `ListPlayers`, `known`], [receipt(1, `known`)])
  const submissions = [receipt(1, `known`), receipt(2, `ListPlayers`)]
  const next = [`old`, `known`, `serversay test3`, `ListPlayers`]
  const rows = f.accept(next, submissions)
  assert.deepEqual(rows.map(row => row.command), next)
  assert.equal(rows[1].id, first[2].id)
  assert.deepEqual(rows.map(row => row.origin), [`unknown`, `spellbook`, `pending`, `spellbook`])
  assert.equal(f.matcher.recoveryReason, ``)
  f.advance(3_000)
  assert.equal(f.accept(next, submissions)[2].origin, `external`)
})

test(`oldest eviction and a repeated tail entry do not hide fresh history`, () => {
  const f = fixture()
  f.accept([`evicted`, `kept`, `ListPlayers`])
  const next = [`kept`, `serversay test3`, `ListPlayers`]
  const rows = f.accept(next, [receipt(1, `ListPlayers`)])
  assert.deepEqual(rows.map(row => row.command), next)
  f.advance(3_000)
  assert.deepEqual(f.accept(next, [receipt(1, `ListPlayers`)]).map(row => row.origin), [`unknown`, `external`, `spellbook`])
})

test(`a moved existing entry without fresh submission evidence stays unknown`, () => {
  const f = fixture()
  f.accept([`old`, `repeated manual`, `kept`])
  const next = [`old`, `kept`, `repeated manual`]
  assert.deepEqual(f.accept(next).map(row => row.command), next)
  f.advance(3_000)
  assert.deepEqual(f.accept(next).map(row => row.command), next)
  assert.equal(f.accept(next)[2].origin, `unknown`)
})

test(`a batch with oldest eviction and multiple moved entries keeps the manual command separate`, () => {
  const f = fixture()
  f.accept([`evicted one`, `evicted two`, `evicted three`, `kept`, `ListPlayers`, `Discord message`])
  const next = [`kept`, `automatic one`, `Discord message`, `serversay test3`, `ListPlayers`, `automatic two`]
  const submissions = [receipt(1, `automatic one`), receipt(2, `Discord message`), receipt(3, `ListPlayers`), receipt(4, `automatic two`)]
  f.accept(next, submissions)
  f.advance(3_000)
  const rows = f.accept(next, submissions)
  assert.deepEqual(rows.map(row => row.command), next)
  assert.deepEqual(rows.map(row => row.origin), [`unknown`, `spellbook`, `spellbook`, `external`, `spellbook`, `spellbook`])
})

test(`unexplained deletion in the middle still requires a new unknown baseline`, () => {
  const f = fixture()
  f.accept([`one`, `two`, `three`])
  f.accept([`one`, `inserted`, `three`])
  assert.ok(f.matcher.recoveryReason)
  f.advance(3_000)
  assert.deepEqual(f.accept([`one`, `inserted`, `three`]).map(row => row.origin), [`unknown`, `unknown`, `unknown`])
})
