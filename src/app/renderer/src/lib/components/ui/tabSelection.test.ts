import assert from 'node:assert/strict'
import test from 'node:test'
import { selectTabValue } from './tabSelection'

test(`reselecting a tab calls the reselect callback without changing the selected value`, () => {
  let value = `candidates`
  let candidateId: number | null = 42
  let changes = 0
  const onChange = (next: string) => {
    changes += 1
    value = next
  }
  const onReselect = () => candidateId = null
  selectTabValue(`candidates`, value, onChange, onReselect)
  assert.equal(value, `candidates`)
  assert.equal(candidateId, null)
  assert.equal(changes, 0)
  selectTabValue(`players`, value, onChange, onReselect)
  assert.equal(value, `players`)
  assert.equal(changes, 1)
})
