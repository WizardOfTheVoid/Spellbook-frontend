import assert from 'node:assert/strict'
import test from 'node:test'

test(`celebrates promotions once and stays quiet for initial or unchanged first place`, async () => {
  const { dashboardRankCelebration } = await import(`./dashboardRankCelebration`)
  const node = {} as HTMLElement
  const launches: HTMLElement[] = []
  const action = dashboardRankCelebration(node, { id: `user:1`, rank: 1, scopeKey: `global:30Days` }, element => launches.push(element))
  action.update({ id: `user:1`, rank: 1, scopeKey: `global:30Days` })
  assert.equal(launches.length, 0)
  action.update({ id: `user:1`, rank: 2, scopeKey: `global:30Days` })
  action.update({ id: `user:1`, rank: 1, scopeKey: `global:30Days` })
  assert.deepEqual(launches, [node])
  action.update({ id: `user:1`, rank: 1, scopeKey: `global:30Days` })
  assert.deepEqual(launches, [node])
  action.update({ id: `user:1`, rank: 3, scopeKey: `global:30Days` })
  action.update({ id: `user:1`, rank: 1, scopeKey: `global:30Days` })
  assert.deepEqual(launches, [node, node])
})

test(`does not celebrate when the ranking scope or row identity changes`, async () => {
  const { dashboardRankCelebration } = await import(`./dashboardRankCelebration`)
  const launches: HTMLElement[] = []
  const node = {} as HTMLElement
  const action = dashboardRankCelebration(node, { id: `user:1`, rank: 2, scopeKey: `global:30Days` }, element => launches.push(element))
  action.update({ id: `user:1`, rank: 1, scopeKey: `team:30Days` })
  action.update({ id: `user:1`, rank: 2, scopeKey: `team:30Days` })
  action.update({ id: `user:2`, rank: 1, scopeKey: `team:30Days` })
  assert.equal(launches.length, 0)
})
