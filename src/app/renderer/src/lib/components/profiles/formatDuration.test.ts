import assert from 'node:assert/strict'
import test from 'node:test'
import { formatDuration } from './formatDuration'

test(`duration labels convert hours with singular units and one decimal precision`, () => {
	for (const [hours, expected] of [
		[1, `1 hour`], [2, `2 hours`], [23, `23 hours`],
		[24, `1 day`], [36, `1.5 days`], [48, `2 days`],
		[168, `1 week`], [336, `2 weeks`], [571, `3.4 weeks`],
		[720, `1 month`], [2304, `3.2 months`], [1337, `1.9 months`],
		[999999, `MAX`]
	] as const) assert.equal(formatDuration(hours), expected)
})
