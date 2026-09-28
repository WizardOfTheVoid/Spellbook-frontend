import assert from 'node:assert/strict'
import test from 'node:test'
import { RangeGesture, nearestRangeHandle } from './rangeInteraction'

const point = (clientX: number, clientY = 20, pointerId = 1) => ({ clientX, clientY, pointerId })

test(`a stationary click opens editing without becoming a drag`, () => {
	const gesture = new RangeGesture()
	gesture.start(point(100))
	assert.equal(gesture.move(point(102)), false)
	assert.equal(gesture.finish(point(102)), `edit`)
})

test(`a drag never becomes a click even after returning to its starting point`, () => {
	const gesture = new RangeGesture()
	gesture.start(point(100))
	assert.equal(gesture.move(point(106)), true)
	assert.equal(gesture.move(point(100)), true)
	assert.equal(gesture.finish(point(100)), `drag`)
	assert.equal(gesture.finish(point(100)), null)
})

test(`pointer release movement, cancellation, and unrelated pointers cannot open editing`, () => {
	const gesture = new RangeGesture()
	gesture.start(point(100))
	assert.equal(gesture.move(point(200, 20, 2)), false)
	assert.equal(gesture.finish(point(100, 20, 2)), null)
	assert.equal(gesture.finish(point(100, 30)), `drag`)
	gesture.start(point(100))
	gesture.cancel()
	assert.equal(gesture.finish(point(100)), null)
})

test(`step selection moves the nearest visible handle and breaks ties toward minimum`, () => {
	assert.equal(nearestRangeHandle(75, 0, 100), `maximum`)
	assert.equal(nearestRangeHandle(25, 0, 100), `minimum`)
	assert.equal(nearestRangeHandle(50, 0, 100), `minimum`)
	assert.equal(nearestRangeHandle(75, 50, 50), `maximum`)
	assert.equal(nearestRangeHandle(25, 50, 50), `minimum`)
})
