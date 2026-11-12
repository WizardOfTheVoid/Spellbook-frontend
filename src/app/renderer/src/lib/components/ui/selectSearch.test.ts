import assert from 'node:assert/strict'
import test from 'node:test'
import { selectOnlySearchResult } from './selectSearch'

function key(key = `Enter`, isComposing = false) {
  let prevented = false
  return { input: { key, isComposing, preventDefault: () => { prevented = true } }, prevented: () => prevented }
}

test(`Enter selects the sole enabled search result and prevents form submission`, () => {
  const event = key()
  const result = { value: `magic`, label: `MAGIC` }
  const selected: string[] = []
  assert.equal(selectOnlySearchResult(event.input, [result], option => selected.push(option.value)), true)
  assert.deepEqual(selected, [`magic`])
  assert.equal(event.prevented(), true)
})

for (const [name, options] of [
  [`empty`, []],
  [`ambiguous`, [{ value: `one`, label: `One` }, { value: `two`, label: `Two` }]],
  [`disabled`, [{ value: `one`, label: `One`, disabled: true }]],
  [`one enabled and one disabled`, [{ value: `one`, label: `One` }, { value: `two`, label: `Two`, disabled: true }]]
] as const) {
  test(`Enter leaves ${name} results unchanged and prevents form submission`, () => {
    const event = key()
    let changes = 0
    assert.equal(selectOnlySearchResult(event.input, options, () => changes++), true)
    assert.equal(changes, 0)
    assert.equal(event.prevented(), true)
  })
}

test(`other keys and composition confirmation keep their existing behavior`, () => {
  for (const event of [key(`ArrowDown`), key(`Escape`), key(` `), key(`Enter`, true)]) {
    let changes = 0
    assert.equal(selectOnlySearchResult(event.input, [{ value: `one`, label: `One` }], () => changes++), false)
    assert.equal(changes, 0)
    assert.equal(event.prevented(), false)
  }
})
