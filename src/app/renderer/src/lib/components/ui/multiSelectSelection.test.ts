import assert from 'node:assert/strict'
import test from 'node:test'
import { allMultiSelectValues, toggleMultiSelectValue } from './multiSelectSelection'

const options = Array.from({ length: 101 }, (_, id) => ({ value: String(id), label: String(id) }))

test(`bounded multi-select refuses the next option but allows removing and replacing a selection`, () => {
  const value = options.slice(0, 100).map(option => option.value)
  assert.deepEqual(toggleMultiSelectValue(value, options[100], 100), value)
  const removed = toggleMultiSelectValue(value, options[0], 100)
  const replaced = toggleMultiSelectValue(removed, options[100], 100)
  assert.equal(replaced.length, 100)
  assert.equal(replaced.includes(`100`), true)
})

test(`Select all respects the bound, clears selected values, and preserves unlimited controls`, () => {
  assert.equal(allMultiSelectValues([], options, true, 100).length, 100)
  assert.equal(allMultiSelectValues([], options, true).length, 101)
  assert.deepEqual(allMultiSelectValues([`0`, `1`], options, false, 100), [])
  const disabled = [{ value: `locked`, label: `Locked`, disabled: true }, ...options]
  assert.deepEqual(allMultiSelectValues([`locked`, `0`], disabled, false, 100), [`locked`])
  assert.deepEqual(toggleMultiSelectValue([], disabled[0], 100), [])
})
