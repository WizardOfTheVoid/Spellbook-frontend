import assert from 'node:assert/strict'
import test from 'node:test'
import {
  countAdvancedServerFilters,
  createDefaultServerFilters,
  createServerQuery,
  defaultServerFilters,
  resolveServerPageAfterMutation,
  selectedServerMode,
  selectedServerChipIds,
  toggleServerFilter
} from './serverArchive.js'

test(`creates a compact raw-name server query`, () => {
  assert.deepEqual(createServerQuery({
    page: 3,
    search: ` Duel `,
    filters: { ...defaultServerFilters, official: false, minSlots: 20, maxSlots: 64 }
  }), {
    page: 3,
    search: `Duel`,
    official: false,
    minSlots: 20,
    maxSlots: 64
  })
})

test(`ignores remembered game-mode selections when building browser requests`, () => {
  const filters = { ...createDefaultServerFilters(), region: `EU`, gameMode: `FFA` }
  assert.deepEqual(createServerQuery({ page: 1, search: ``, filters }), { page: 1, region: `EU` })
  assert.equal(countAdvancedServerFilters(filters), 1)
})

test(`sends the selected derived mode and counts it as an advanced filter`, () => {
  const filters = { ...createDefaultServerFilters(), mode: `Duels` as const }
  assert.deepEqual(createServerQuery({ page: 1, search: ``, filters }), { page: 1, mode: `Duels` })
  assert.equal(countAdvancedServerFilters(filters), 1)
})

test(`includes Mine only while selected`, () => {
  const filters = toggleServerFilter(createDefaultServerFilters(), `yours`)

  assert.equal(filters.yours, true)
  assert.deepEqual(selectedServerChipIds(filters), [`yours`])
  assert.equal(createServerQuery({ page: 1, search: ``, filters }).yours, true)
  assert.equal(toggleServerFilter(filters, `yours`).yours, false)
})

test(`toggles mutually exclusive providers and the Duels chip`, () => {
  let filters = createDefaultServerFilters()
  filters = toggleServerFilter(filters, `tb`)
  assert.equal(filters.official, true)
  filters = toggleServerFilter(filters, `nitrado`)
  assert.equal(filters.official, false)
  filters = toggleServerFilter(filters, `duels`)
  assert.equal(filters.mode, `Duels`)
  assert.deepEqual(selectedServerChipIds(filters), [`nitrado`, `duels`])
})

test(`mode buttons switch one shared selection and toggle it off`, () => {
  let filters = createDefaultServerFilters()
  for (const [id, mode] of [[`social`, `Social`], [`duels`, `Duels`], [`ffa`, `FFA`], [`mixed`, `Mixed`], [`to`, `TO`], [`lts`, `LTS`]] as const) {
    filters = toggleServerFilter(filters, id)
    assert.deepEqual(createServerQuery({ page: 1, search: ``, filters }), { page: 1, mode })
    assert.deepEqual(selectedServerChipIds(filters), [id])
    assert.equal(selectedServerMode(filters), mode)
  }
  filters = toggleServerFilter(filters, `lts`)
  assert.deepEqual(createServerQuery({ page: 1, search: ``, filters }), { page: 1 })
  assert.deepEqual(selectedServerChipIds(filters), [])
})

test(`mode buttons reflect advanced selections and replace remembered Duels filters`, () => {
  const legacy = { ...createDefaultServerFilters(), duels: true }
  assert.equal(selectedServerMode(legacy), `Duels`)
  assert.deepEqual(createServerQuery({ page: 1, search: ``, filters: legacy }), { page: 1, mode: `Duels` })
  assert.deepEqual(selectedServerChipIds(legacy), [`duels`])
  const filters = toggleServerFilter(legacy, `ffa`)
  assert.equal(filters.duels, false)
  assert.deepEqual(createServerQuery({ page: 1, search: ``, filters }), { page: 1, mode: `FFA` })
  assert.deepEqual(selectedServerChipIds({ ...filters, mode: `Social` }), [`social`])
  assert.deepEqual(selectedServerChipIds(toggleServerFilter({ ...filters, mode: `Social` }, `social`)), [])
})

test(`omits full slot and player ranges and fixed default sorting`, () => {
  assert.deepEqual(createServerQuery({ page: 1, search: ``, filters: createDefaultServerFilters() }), { page: 1 })
  const filters = { ...createDefaultServerFilters(), minPlayers: 2, maxPlayers: 40, sortBy: `alphabetical` as const, sortOrder: `asc` as const }
  assert.deepEqual(createServerQuery({ page: 1, search: ``, filters }), {
    page: 1,
    minPlayers: 2,
    maxPlayers: 40,
    sortBy: `alphabetical`,
    sortOrder: `asc`
  })
})

test(`moves back one page only after empty mutations`, () => {
  assert.equal(resolveServerPageAfterMutation(3, 0), 2)
  assert.equal(resolveServerPageAfterMutation(3, 1), 3)
  assert.equal(resolveServerPageAfterMutation(1, 0), 1)
})

