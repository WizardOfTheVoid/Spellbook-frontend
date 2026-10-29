import assert from 'node:assert/strict'
import test from 'node:test'
import { createRangeScale } from './rangeScale'

const steps = [1, 2, 3, 4, 8, 10, 12, 24, 48, 72, 96, 168, 336, 672]

test(`natural spacing reserves readable gaps and pointer selection follows displayed stops`, () => {
	const values = [1, 2, 3, 4, 8, 10, 12, 24, 48, 72, 96, 168, 336, 672]
	const scale = createRangeScale(1, 672, 1, values, true, 460)
	for (let index = 1; index < scale.ticks.length; index++) {
		assert.ok((scale.ticks[index] - scale.ticks[index - 1]) * 4.6 >= 22 - 1e-10)
	}
	assert.ok(scale.ticks[13] - scale.ticks[12] > scale.ticks[1] - scale.ticks[0])
	for (const [index, value] of values.entries()) assert.equal(scale.fromRatio(scale.ticks[index] / 100), value)
	assert.ok(scale.progress(500) > scale.progress(336))
	assert.ok(scale.progress(500) < scale.progress(672))
	assert.deepEqual(createRangeScale(0, 100, 1, [0, 10, 100], true, 0).ticks, [0, 50, 100])
})

test(`natural spacing uses numeric distances while retaining discrete keyboard steps`, () => {
	const scale = createRangeScale(0, 100, 1, [0, 10, 100], true, 100)
	assert.ok(Math.abs(scale.ticks[1] - 27.6) < 1e-10)
	assert.ok(Math.abs(scale.progress(55) - 63.8) < 1e-10)
	assert.equal(scale.fromRatio(0.2), 10)
	assert.equal(scale.fromRatio(0.8), 100)
	assert.equal(scale.fromInput(1), 10)
	assert.equal(scale.snap(55, true), 55)
	assert.equal(scale.snap(55), 10)
	assert.equal(createRangeScale(0, 100, 1, [24], true).progress(24), 0)
	assert.deepEqual(createRangeScale(0, 100, 1, [0, 10, 100]).ticks, [0, 50, 100])
})

test(`numeric steps expose selectable stops while allowing exact typed values`, () => {
	const scale = createRangeScale(0, 1000, 100)
	assert.deepEqual(scale.tickValues, [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
	assert.equal(scale.snap(101, true), 101)
	assert.equal(scale.snap(scale.tickValues[2], true), 200)
	assert.equal(scale.ticks[2], 20)
	assert.deepEqual(createRangeScale(1, 6, 2).tickValues, [1, 3, 5])
	assert.deepEqual(createRangeScale(0, 100, 1).tickValues, [])
	assert.deepEqual(createRangeScale(0, 100, 1, steps).tickValues, steps)
})

test(`custom stops use equal spacing and return actual values`, () => {
	const scale = createRangeScale(0, 100, 1, steps)
	assert.equal(scale.fromInput(4), 8)
	assert.equal(scale.fromInput(5), 10)
	assert.equal(scale.toInput(512), 13)
	assert.equal(scale.fromRatio(0.5), 24)
	assert.equal(scale.fromRatio(-1), 1)
	assert.equal(scale.fromRatio(2), 672)
	assert.equal(scale.progress(672), 100)
})

test(`custom stops snap incoming values and normalize without mutating the caller`, () => {
	const values = [24, 4, 8, 8, NaN, Infinity]
	const scale = createRangeScale(0, 100, 1, values)
	assert.equal(scale.toInput(7), 1)
	assert.equal(scale.toInput(-10), 0)
	assert.equal(scale.toInput(100), 2)
	assert.equal(scale.fromInput(1), 8)
	assert.deepEqual(values, [24, 4, 8, 8, NaN, Infinity])
})

test(`ordinary ranges preserve fractional stepping and bounds`, () => {
	const scale = createRangeScale(1, 3, 0.1)
	assert.equal(scale.fromRatio(0.31), 1.6)
	assert.equal(scale.fromRatio(-1), 1)
	assert.equal(scale.fromRatio(2), 3)
	assert.equal(scale.toInput(2), 2)
	assert.equal(scale.progress(2), 50)
	assert.equal(createRangeScale(1, 3, 1, []).fromRatio(0.5), 2)
})

test(`single custom stop and fixed ranges remain finite`, () => {
	const scale = createRangeScale(0, 100, 1, [24])
	assert.equal(scale.fromRatio(0.8), 24)
	assert.equal(scale.fromInput(1), 24)
	assert.equal(scale.progress(24), 0)
	assert.equal(createRangeScale(5, 5, 1).fromRatio(0.5), 5)
	assert.equal(createRangeScale(5, 5, 1).progress(5), 0)
})

test(`typed numbers snap to the closest allowed value and clamp to bounds`, () => {
	const custom = createRangeScale(0, 100, 1, steps)
	assert.equal(custom.snap(9), 8)
	assert.equal(custom.snap(11.1), 12)
	assert.equal(custom.snap(-20), 1)
	assert.equal(custom.snap(2000), 672)
	const linear = createRangeScale(1, 10, 2)
	assert.equal(linear.snap(6.2), 7)
	assert.equal(linear.snap(-4), 1)
	assert.equal(linear.snap(30), 10)
})

test(`allowOutOfStep preserves typed numbers but still clamps to bounds`, () => {
	const linear = createRangeScale(0, 1000, 100)
	assert.equal(linear.snap(101, true), 101)
	assert.equal(linear.snap(101), 100)
	assert.equal(linear.snap(101, false), 100)
	assert.equal(linear.snap(101.5, true), 101.5)
	assert.equal(linear.snap(-5, true), 0)
	assert.equal(linear.snap(1001, true), 1000)
	assert.equal(linear.fromRatio(0.101), 100)

	const custom = createRangeScale(0, 100, 1, steps)
	assert.equal(custom.snap(101, true), 101)
	assert.equal(custom.snap(101, false), 96)
	assert.equal(custom.snap(-5, true), 1)
	assert.equal(custom.snap(2000, true), 672)
	assert.equal(custom.fromInput(10), 96)
})
