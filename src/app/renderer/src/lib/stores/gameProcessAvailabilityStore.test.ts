import assert from "node:assert/strict"
import test from "node:test"
import { get } from "svelte/store"
import type { CoreCallResult } from "$lib/core"
import { createGameProcessAvailabilityStore } from "./gameProcessAvailabilityStore"

test("polls only while active and resets when hidden", async () => {
	const scheduler = createScheduler()
	let calls = 0
	const store = createGameProcessAvailabilityStore(
		{ meta: async () => { calls += 1; return meta(true) } },
		scheduler,
	)

	assert.equal(get(store), false)
	store.sync(true)
	await store.refresh()
	assert.equal(calls, 1)
	assert.equal(get(store), true)

	store.sync(false)
	assert.equal(get(store), false)
	scheduler.tickIntervals()
	await Promise.resolve()
	assert.equal(calls, 1)
})

test("uses single-flight polling and invalidates failures or malformed metadata", async () => {
	const scheduler = createScheduler()
	let resolveFirst!: (result: CoreCallResult) => void
	let calls = 0
	const store = createGameProcessAvailabilityStore(
		{ meta: () => {
			calls += 1
			return calls === 1
				? new Promise(resolve => { resolveFirst = resolve })
				: Promise.resolve(metaPayload({ nope: true }))
		} },
		scheduler,
	)

	store.sync(true)
	scheduler.tickIntervals()
	assert.equal(calls, 1)
	resolveFirst(meta(true))
	await store.refresh()
	assert.equal(get(store), true)

	scheduler.tickIntervals()
	await store.refresh()
	assert.equal(get(store), false)
})

test("expires a previously successful value after five seconds", async () => {
	const scheduler = createScheduler()
	let resolveSecond!: (result: CoreCallResult) => void
	let calls = 0
	const store = createGameProcessAvailabilityStore(
		{ meta: () => {
			calls += 1
			return calls === 1
				? Promise.resolve(meta(true))
				: new Promise(resolve => { resolveSecond = resolve })
		} },
		scheduler,
	)

	store.sync(true)
	await store.refresh()
	assert.equal(get(store), true)

	scheduler.advance(2_000)
	scheduler.tickIntervals()
	scheduler.advance(3_001)
	scheduler.tickIntervals()
	assert.equal(get(store), false)

	resolveSecond(meta(true))
	await Promise.resolve()
})

test(`focus requires a running game and explicit focus data, and clears when polling stops`, async () => {
	let value: CoreCallResult = metaPayload({ gameRunning: true, focus: { gameIsFocused: true } })
	const store = createGameProcessAvailabilityStore({ meta: async () => value }, createScheduler())
	store.sync(true)
	await store.refresh()
	assert.equal(get(store.focused), true)
	for (const data of [
		{ gameRunning: false, focus: { gameIsFocused: true } },
		{ gameRunning: true, focus: { gameIsFocused: false } },
		{ gameRunning: true }
	]) {
		value = metaPayload(data)
		await store.refresh()
		assert.equal(get(store.focused), false)
	}
	value = metaPayload({ gameRunning: true, focus: { gameIsFocused: true } })
	await store.refresh()
	assert.equal(get(store.focused), true)
	store.sync(false)
	assert.equal(get(store.focused), false)
})

test(`focus is cleared when Core fails or its last response becomes stale`, async () => {
	const scheduler = createScheduler()
	let fail = false
	const store = createGameProcessAvailabilityStore({ meta: async () => {
		if (fail) throw new Error(`Core unavailable`)
		return metaPayload({ gameRunning: true, focus: { gameIsFocused: true } })
	} }, scheduler)
	store.sync(true)
	await store.refresh()
	assert.equal(get(store.focused), true)
	fail = true
	await store.refresh()
	assert.equal(get(store.focused), false)
	fail = false
	await store.refresh()
	scheduler.advance(5_001)
	scheduler.tickIntervals()
	assert.equal(get(store.focused), false)
	store.sync(false)
})

function meta(gameRunning: boolean): CoreCallResult {
	return metaPayload({ gameRunning })
}

function metaPayload(data: Record<string, unknown>): CoreCallResult {
	return {
		ok: true,
		status: 200,
		statusText: "OK",
		data: { ok: true, data },
	}
}

function createScheduler() {
	let now = 0
	let nextId = 0
	const intervals = new Map<number, () => void>()
	return {
		now: () => now,
		setInterval: (callback: () => void) => {
			const id = ++nextId
			intervals.set(id, callback)
			return id
		},
		clearInterval: (id: number) => { intervals.delete(id) },
		advance: (milliseconds: number) => { now += milliseconds },
		tickIntervals: () => { for (const callback of intervals.values()) callback() },
	}
}
