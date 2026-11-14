import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeForensicsTab } from './forensicsTabs'

test(`restores current tabs and normalizes obsolete or invalid tabs to Ping`, () => {
  for (const tab of [`ping`, `triangulate`, `friends`, `rhythm`]) assert.equal(normalizeForensicsTab(tab), tab)
  for (const tab of [`altDetection`, `meta`, `unknown`, null, 7, {}]) assert.equal(normalizeForensicsTab(tab), `ping`)
})
