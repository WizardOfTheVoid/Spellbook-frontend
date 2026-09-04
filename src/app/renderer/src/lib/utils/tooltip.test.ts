import assert from "node:assert/strict"
import test from "node:test"
import { get } from "svelte/store"
import { tooltip, tooltipState } from "./tooltip"

test(`shows and hides an ancestor tooltip from nested keyboard focus`, () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, `window`)
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: eventTarget()
	})
	const parent = eventTarget()
	const child = eventTarget(parent)
	const action = tooltip(parent as unknown as HTMLElement, `Keyboard help`)

	try {
		child.dispatch(`focusin`)
		assert.equal(get(tooltipState)?.text, `Keyboard help`)

		child.dispatch(`focusout`)
		assert.equal(get(tooltipState), null)
	} finally {
		action?.destroy?.()
		tooltipState.set(null)
		if (originalWindow) Object.defineProperty(globalThis, `window`, originalWindow)
		else delete (globalThis as { window?: unknown }).window
	}
})

test(`preserves safe emphasized tooltip text as a separate value`, () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, `window`)
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: eventTarget()
	})
	const node = eventTarget()
	const action = tooltip(node as unknown as HTMLElement, {
		text: `v1.0.10 ->`,
		emphasis: `v1.0.11`,
	})

	try {
		node.dispatch(`pointerenter`)
		assert.deepEqual(get(tooltipState), {
			text: `v1.0.10 ->`,
			emphasis: `v1.0.11`,
			placement: `right`,
			anchor: {
				left: 10,
				top: 20,
				right: 110,
				bottom: 60,
				width: 100,
				height: 40,
			},
		})
	} finally {
		action?.destroy?.()
		tooltipState.set(null)
		if (originalWindow) Object.defineProperty(globalThis, `window`, originalWindow)
		else delete (globalThis as { window?: unknown }).window
	}
})

type TestEventTarget = {
	parent: TestEventTarget | null
	listeners: Map<string, Set<() => void>>
	addEventListener: (type: string, listener: () => void) => void
	removeEventListener: (type: string, listener: () => void) => void
	dispatch: (type: string) => void
	getBoundingClientRect: () => DOMRect
}

function eventTarget(parent: TestEventTarget | null = null): TestEventTarget {
	const target: TestEventTarget = {
		parent,
		listeners: new Map(),
		addEventListener(type, listener) {
			const listeners = target.listeners.get(type) ?? new Set()
			listeners.add(listener)
			target.listeners.set(type, listeners)
		},
		removeEventListener(type, listener) {
			target.listeners.get(type)?.delete(listener)
		},
		dispatch(type) {
			let current: TestEventTarget | null = target
			while (current) {
				for (const listener of current.listeners.get(type) ?? []) listener()
				current = current.parent
			}
		},
		getBoundingClientRect: () => ({
			left: 10,
			top: 20,
			right: 110,
			bottom: 60,
			width: 100,
			height: 40
		}) as DOMRect
	}
	return target
}
