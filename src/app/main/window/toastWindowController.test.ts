import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { ToastWindowController } from './toast-window-controller.js'
import type { ToastWindowFactory } from './toast-window-factory.js'

function setup(isGameFocused: () => Promise<boolean> = async () => false) {
	const messages: unknown[] = []
	let shown = 0
	let hidden = 0
	let visible = false
	let raised = 0
	const ignored: boolean[] = []
	const window = Object.assign(new EventEmitter(), {
		webContents: { id: 7, send: (_channel: string, value: unknown) => messages.push(value) },
		isDestroyed: () => false,
		setBounds: () => {},
		setAlwaysOnTop: () => {},
		showInactive: () => { shown += 1; visible = true },
		isVisible: () => visible,
		moveTop: () => { raised += 1 },
		setIgnoreMouseEvents: (value: boolean) => ignored.push(value),
		hide: () => { hidden += 1; visible = false },
	})
	const controller = new ToastWindowController({
		createWindow: () => window,
		loadContent: () => {},
		getTargetBounds: () => ({ x: 0, y: 0, width: 400, height: 116 }),
	} as unknown as ToastWindowFactory, isGameFocused)
	return { controller, messages, window, shown: () => shown, hidden: () => hidden, raised: () => raised, ignored }
}

test(`waits for the toast renderer listener before first delivery`, async () => {
	const h = setup()
	const showing = h.controller.show({ message: `Hello`, level: `info` })
	assert.equal(h.messages.length, 0)
	assert.equal(h.shown(), 0)
	h.controller.ready(9)
	assert.equal(h.messages.length, 0)
	h.controller.ready(7)
	assert.equal(await showing, true)
	assert.equal(h.messages.length, 1)
	assert.equal(h.shown(), 1)
	h.controller.hide()
})

test(`hiding cancels a toast still waiting for its renderer`, async () => {
	const h = setup()
	const showing = h.controller.show({ message: `Hello`, level: `info` })
	h.controller.hide()
	h.controller.ready(7)
	assert.equal(await showing, false)
	assert.equal(h.messages.length, 0)
	assert.equal(h.shown(), 0)
})


test(`shows while the game is focused and switches between click-through and clickable`, async () => {
	let focused = true
	const h = setup(async () => focused)
	const showing = h.controller.show({ message: `Hello`, level: `info` })
	h.controller.ready(7)
	assert.equal(await showing, true)
	await h.controller.updateInteractivity()
	assert.equal(h.ignored.at(-1), true)
	focused = false
	await h.controller.updateInteractivity()
	assert.equal(h.ignored.at(-1), false)
	h.controller.hide()
})

test(`raising an existing toast preserves it without redisplaying a hidden toast`, async () => {
	const h = setup()
	const showing = h.controller.show({ message: `Hello`, level: `info` })
	h.controller.ready(7)
	await showing
	const raises = h.raised()
	h.controller.raise()
	assert.equal(h.raised(), raises + 1)
	assert.equal(h.hidden(), 0)
	h.controller.hide()
	h.controller.raise()
	assert.equal(h.raised(), raises + 1)
})

test(`only the toast renderer can activate the visible action and only once`, async () => {
	const h = setup()
	let activated = 0
	const showing = h.controller.show({ message: `Hello`, level: `info`, actionId: 1, actionLabel: `Open` }, () => { activated += 1 })
	h.controller.ready(7)
	await showing
	h.controller.activate(9, 1)
	h.controller.activate(7, 2)
	assert.equal(activated, 0)
	h.controller.activate(7, 1)
	h.controller.activate(7, 1)
	assert.equal(activated, 1)
	assert.equal(h.window.isVisible(), false)
	await h.controller.show({ message: `Hello`, level: `info`, actionId: 2 }, () => { activated += 1 })
	h.controller.hide()
	h.controller.activate(7, 2)
	assert.equal(activated, 1)
})

test(`polls pointer mode only while the toast is visible`, async context => {
	context.mock.timers.enable({ apis: [`setInterval`] })
	let checks = 0
	let focused = true
	const h = setup(async () => { checks += 1; return focused })
	const showing = h.controller.show({ message: `Hello`, level: `info` })
	h.controller.ready(7)
	await showing
	await h.controller.updateInteractivity()
	focused = false
	const initialChecks = checks
	context.mock.timers.tick(500)
	await h.controller.updateInteractivity()
	assert.equal(checks, initialChecks + 1)
	assert.equal(h.ignored.at(-1), false)
	h.controller.hide()
	context.mock.timers.tick(1000)
	assert.equal(checks, initialChecks + 1)
})
