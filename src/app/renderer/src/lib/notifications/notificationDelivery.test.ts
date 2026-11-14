import assert from 'node:assert/strict'
import test from 'node:test'
import { createNotificationDelivery } from './notificationDelivery.js'
import type { NotificationRequest } from './notificationTypes.js'
import type { ToastRequest } from '../../../../shared/notificationToast.js'

const request: NotificationRequest = { message: `Player banned`, description: `Details`, level: `success`, sound: `badge`, dedupeKey: `ban:1`, createdAt: new Date(100_000).toISOString() }

function setup(native = true, displayed = true) {
	const app: NotificationRequest[] = []
	const overlay: ToastRequest[] = []
	const sounds: string[] = []
	const delivery = createNotificationDelivery({
		hasNativeToast: () => native,
		showApp: value => app.push(value),
		showNative: async value => { overlay.push(value); return displayed },
		playSound: value => sounds.push(value),
		now: () => 100_000,
	})
	return { delivery, app, overlay, sounds }
}

test(`desktop arrivals always use the separate overlay and play their sound once`, async () => {
	const h = setup()
	await h.delivery.show(request)
	await h.delivery.show(request)
	assert.equal(h.app.length, 0)
	assert.equal(h.overlay.length, 1)
	assert.deepEqual(h.sounds, [`badge`])
})

test(`server context and notification age do not restrict desktop display`, async () => {
	const h = setup()
	await h.delivery.show({ ...request, gameServerId: 8, createdAt: new Date(0).toISOString() })
	assert.equal(h.overlay.length, 1)
	assert.deepEqual(h.sounds, [`badge`])
})

test(`native delivery strips callbacks but preserves the notification content`, async () => {
	const h = setup()
	await h.delivery.show({ ...request, action: { label: `Open`, onClick: () => {} } })
	assert.doesNotThrow(() => structuredClone(h.overlay[0]))
	assert.equal((h.overlay[0] as NotificationRequest).description, request.description)
})

test(`browser previews retain the app toast and its action`, async () => {
	const h = setup(false)
	let opened = false
	await h.delivery.show({ ...request, action: { label: `Open`, onClick: () => { opened = true } } })
	assert.equal(h.overlay.length, 0)
	await h.app[0]?.action?.onClick()
	assert.equal(opened, true)
})

test(`native actions are serializable and activate only the latest callback once`, async () => {
	const h = setup()
	const opened: number[] = []
	await h.delivery.show({ ...request, createdAt: undefined, action: { label: `Open`, onClick: () => { opened.push(1) } } })
	const first = h.overlay[0].actionId!
	await h.delivery.show({ ...request, createdAt: undefined, action: { label: `Open`, onClick: () => { opened.push(2) } } })
	const second = h.overlay[1].actionId!
	assert.equal(h.overlay[1].actionLabel, `Open`)
	await h.delivery.activate(first)
	await h.delivery.activate(second)
	await h.delivery.activate(second)
	assert.deepEqual(opened, [2])
})

test(`cleared sessions and rejected native toasts cannot activate actions`, async () => {
	for (const displayed of [true, false]) {
		const h = setup(true, displayed)
		let opened = false
		await h.delivery.show({ ...request, action: { label: `Open`, onClick: () => { opened = true } } })
		if (displayed) h.delivery.clear()
		await h.delivery.activate(h.overlay[0].actionId!)
		assert.equal(opened, false)
	}
})

test(`clear cancels pending sound and resets session deduplication`, async () => {
	const h = setup()
	const pending = h.delivery.show(request)
	h.delivery.clear()
	await pending
	assert.equal(h.sounds.length, 0)
	await h.delivery.show(request)
	assert.equal(h.overlay.length, 2)
	assert.deepEqual(h.sounds, [`badge`])
})

test(`a cancelled native toast does not play sound or duplicate into the app`, async () => {
	const h = setup(true, false)
	await h.delivery.show(request)
	assert.equal(h.sounds.length, 0)
	assert.equal(h.app.length, 0)
})

test(`local notifications can update an existing dedupe key`, async () => {
	const h = setup()
	await h.delivery.show({ ...request, createdAt: undefined })
	await h.delivery.show({ ...request, createdAt: undefined, description: `Updated details` })
	assert.equal(h.overlay.length, 2)
	assert.equal((h.overlay[1] as NotificationRequest).description, `Updated details`)
})
