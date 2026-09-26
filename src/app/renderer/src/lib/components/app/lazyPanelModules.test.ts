import assert from 'node:assert/strict'
import test from 'node:test'
import { createLazyPanelRegistry, schedulePanelPreload } from './lazyPanelModules'

test('caches pending and successful panel imports and retries a rejected import', async () => {
	let calls = 0
	let fail = true
	const component = (() => {}) as never
	const registry = createLazyPanelRegistry({
		admin: async () => {
			calls += 1
			if (fail) throw new Error('chunk failed')
			return { default: component }
		},
	})

	await assert.rejects(registry.load('admin'), /chunk failed/)
	fail = false
	const [first, second] = await Promise.all([registry.load('admin'), registry.load('admin')])

	assert.equal(calls, 2)
	assert.equal(first, component)
	assert.equal(second, component)
})

test('schedules preloading after a frame and runs once through the timeout fallback', async () => {
	const callbacks: {
		frame?: FrameRequestCallback
		idle?: IdleRequestCallback
		timer?: () => void
	} = {}
	let calls = 0
	const target = {
		requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.frame = callback; return 1 },
		cancelAnimationFrame: () => {},
		requestIdleCallback: (callback: IdleRequestCallback) => { callbacks.idle = callback; return 2 },
		cancelIdleCallback: () => {},
		setTimeout: (callback: TimerHandler) => { callbacks.timer = callback as () => void; return 3 },
		clearTimeout: () => {},
	}

	schedulePanelPreload(target as never, async () => { calls += 1 })
	assert.equal(calls, 0)
	callbacks.frame?.(0)
	assert.equal(calls, 0)
	callbacks.timer?.()
	callbacks.idle?.({ didTimeout: false, timeRemaining: () => 10 })
	await Promise.resolve()

	assert.equal(calls, 1)
})

test('cancellation prevents scheduled panel preloading', () => {
	const callbacks: { frame?: FrameRequestCallback } = {}
	let calls = 0
	const target = {
		requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.frame = callback; return 1 },
		cancelAnimationFrame: () => {},
		requestIdleCallback: () => 2,
		cancelIdleCallback: () => {},
		setTimeout: () => 3,
		clearTimeout: () => {},
	}
	const cancel = schedulePanelPreload(target as never, async () => { calls += 1 })

	cancel()
	callbacks.frame?.(0)

	assert.equal(calls, 0)
})
