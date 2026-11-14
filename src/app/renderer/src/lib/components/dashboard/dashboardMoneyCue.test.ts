import assert from 'node:assert/strict'
import test from 'node:test'
import { createDashboardMoneyCue } from './dashboardMoneyCue'
import { defaultDashboardQuery } from './dashboardViewModel'
import { createDashboardPreviewData } from './preview/dashboardPreviewData'

test(`plays once per live amount change without replaying on load or scope changes`, () => {
  let plays = 0
  const observe = createDashboardMoneyCue(() => plays++)
  const data = createDashboardPreviewData(defaultDashboardQuery)
  observe(data)
  observe(data)
  assert.equal(plays, 0)
  observe({ ...data, metrics: { ...data.metrics, money: data.metrics.money! + 5 } })
  assert.equal(plays, 1)
  observe(null)
  const scoped = createDashboardPreviewData({ ...defaultDashboardQuery, environment: `you` })
  observe(scoped)
  assert.equal(plays, 1)
  observe({ ...scoped, metrics: { ...scoped.metrics, money: scoped.metrics.money! + 5 } })
  assert.equal(plays, 2)
})
