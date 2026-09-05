import assert from "node:assert/strict"
import test from "node:test"

type Rect = {
	left: number
	top: number
	right: number
	bottom: number
	width: number
	height: number
}

type Size = { width: number; height: number }

type OverlayPositionModule = {
	placeAnchoredOverlay: (
		anchor: Rect,
		overlaySize: Size,
		viewportSize: Size,
		placement: `right` | `left` | `top` | `bottom`,
		gap?: number,
		margin?: number,
	) => { x: number; y: number }
}

test(`uses the requested side when it fits`, async () => {
	const { placeAnchoredOverlay } = await loadOverlayPosition()

	assert.deepEqual(placeAnchoredOverlay(
		anchor({ left: 100, top: 160, right: 140, bottom: 200 }),
		{ width: 120, height: 80 },
		{ width: 500, height: 400 },
		`right`,
		16,
	), { x: 156, y: 140 })
})

test(`moves above an anchor when the requested side overflows`, async () => {
	const { placeAnchoredOverlay } = await loadOverlayPosition()

	assert.deepEqual(placeAnchoredOverlay(
		anchor({ left: 430, top: 200, right: 470, bottom: 240 }),
		{ width: 120, height: 80 },
		{ width: 500, height: 400 },
		`right`,
		16,
	), { x: 368, y: 104 })
})

test(`moves below an anchor when the requested side and above both overflow`, async () => {
	const { placeAnchoredOverlay } = await loadOverlayPosition()

	assert.deepEqual(placeAnchoredOverlay(
		anchor({ left: 430, top: 20, right: 470, bottom: 60 }),
		{ width: 120, height: 80 },
		{ width: 500, height: 400 },
		`right`,
		16,
	), { x: 368, y: 76 })
})

function anchor(values: Pick<Rect, `left` | `top` | `right` | `bottom`>): Rect {
	return {
		...values,
		width: values.right - values.left,
		height: values.bottom - values.top,
	}
}

async function loadOverlayPosition(): Promise<OverlayPositionModule> {
	const modulePath = `./overlayPosition`
	const module = await import(modulePath).catch(() => ({}))
	const placeAnchoredOverlay = Reflect.get(module, `placeAnchoredOverlay`)

	assert.equal(
		typeof placeAnchoredOverlay,
		`function`,
		`placeAnchoredOverlay should position shared anchored overlays`,
	)

	return { placeAnchoredOverlay } as OverlayPositionModule
}
