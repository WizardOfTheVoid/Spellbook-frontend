import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultServerFilters,
  createServerQuery,
  defaultServerFilters,
  resolveServerPageAfterMutation,
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
  assert.equal(filters.duels, true)
  assert.deepEqual(selectedServerChipIds(filters), [`nitrado`, `duels`])
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

