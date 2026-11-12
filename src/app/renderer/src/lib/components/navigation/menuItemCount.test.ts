import assert from 'node:assert/strict'
import test from 'node:test'
import { menuItemCount } from './menuItemCount'

test(`item counts use their configured source and the current menu's team scope`, () => {
  const global = { notifications: 7, teamRequests: 3 }
  const team = { ...global, teamRequests: 2 }
  assert.equal(menuItemCount(`notifications`, global), 7)
  assert.equal(menuItemCount(`teamRequests`, global), 3)
  assert.equal(menuItemCount(`teamRequests`, team), 2)
  assert.equal(menuItemCount(undefined, team), 0)
})

test(`missing, invalid and zero counts do not become positive badges`, () => {
  for (const count of [undefined, NaN, Infinity, -2, 0]) {
    assert.equal(menuItemCount(`teamRequests`, { teamRequests: count }), 0)
  }
  assert.equal(menuItemCount(`notifications`, { notifications: 2.9 }), 2)
})

test(`configured placeholder counts are normalized without replacing live count sources`, () => {
  assert.equal(menuItemCount(undefined, {}, 345), 345)
  assert.equal(menuItemCount(undefined, {}, 345.9), 345)
  assert.equal(menuItemCount(`notifications`, { notifications: 7 }, 345), 7)
  assert.equal(menuItemCount(`notifications`, {}, 345), 0)
  for (const count of [NaN, Infinity, -1, 0]) {
    assert.equal(menuItemCount(undefined, {}, count), 0)
  }
})
