import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlayerFiltersInteraction } from './playerFiltersInteraction'

test(`a second filter-trigger click closes after its capture pointer event`, () => {
  const triggerChild = {} as Node
  const inside = {} as Node
  const trigger = { contains: (node: Node) => node === triggerChild } as HTMLElement
  const dialog = { contains: (node: Node) => node === inside } as HTMLElement
  let open = false
  const interaction = createPlayerFiltersInteraction(
    () => open, value => open = value, () => trigger
  )
  interaction.toggle()
  assert.equal(open, true)
  interaction.outsidePointer({ target: triggerChild }, dialog, () => open = false)
  interaction.toggle()
  assert.equal(open, false)
  interaction.toggle()
  interaction.outsidePointer({ target: inside }, dialog, () => open = false)
  assert.equal(open, true)
  interaction.outsidePointer({ target: {} as Node }, dialog, () => open = false)
  assert.equal(open, false)
})
