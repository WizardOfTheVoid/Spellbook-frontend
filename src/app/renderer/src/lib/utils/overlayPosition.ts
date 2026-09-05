export type OverlayPlacement = `right` | `left` | `top` | `bottom`

export type OverlayRect = {
	left: number
	top: number
	right: number
	bottom: number
	width: number
	height: number
}

export type OverlaySize = {
	width: number
	height: number
}

export type OverlayPosition = {
	x: number
	y: number
}

export function placeAnchoredOverlay(
	anchor: OverlayRect,
	overlaySize: OverlaySize,
	viewportSize: OverlaySize,
	placement: OverlayPlacement,
	gap = 12,
	margin = 12,
): OverlayPosition {
	const placements: OverlayPlacement[] = [placement]
	if (placement !== `top`) placements.push(`top`)
	if (placement !== `bottom`) placements.push(`bottom`)

	for (const candidatePlacement of placements) {
		const candidate = positionFor(anchor, overlaySize, candidatePlacement, gap)
		if (fits(candidate, overlaySize, viewportSize, candidatePlacement, margin)) {
			return clampCrossAxis(candidate, overlaySize, viewportSize, candidatePlacement, margin)
		}
	}

	return clampPosition(
		positionFor(anchor, overlaySize, placement, gap),
		overlaySize,
		viewportSize,
		margin,
	)
}

function positionFor(
	anchor: OverlayRect,
	overlaySize: OverlaySize,
	placement: OverlayPlacement,
	gap: number,
): OverlayPosition {
	const centeredX = anchor.left + anchor.width / 2 - overlaySize.width / 2
	const centeredY = anchor.top + anchor.height / 2 - overlaySize.height / 2

	if (placement === `left`) {
		return { x: anchor.left - overlaySize.width - gap, y: centeredY }
	}
	if (placement === `top`) {
		return { x: centeredX, y: anchor.top - overlaySize.height - gap }
	}
	if (placement === `bottom`) {
		return { x: centeredX, y: anchor.bottom + gap }
	}
	return { x: anchor.right + gap, y: centeredY }
}

function fits(
	position: OverlayPosition,
	overlaySize: OverlaySize,
	viewportSize: OverlaySize,
	placement: OverlayPlacement,
	margin: number,
): boolean {
	if (placement === `left`) return position.x >= margin
	if (placement === `top`) return position.y >= margin
	if (placement === `bottom`) {
		return position.y + overlaySize.height <= viewportSize.height - margin
	}
	return position.x + overlaySize.width <= viewportSize.width - margin
}

function clampCrossAxis(
	position: OverlayPosition,
	overlaySize: OverlaySize,
	viewportSize: OverlaySize,
	placement: OverlayPlacement,
	margin: number,
): OverlayPosition {
	if (placement === `left` || placement === `right`) {
		return {
			x: position.x,
			y: clamp(position.y, margin, viewportSize.height - overlaySize.height - margin),
		}
	}

	return {
		x: clamp(position.x, margin, viewportSize.width - overlaySize.width - margin),
		y: position.y,
	}
}

function clampPosition(
	position: OverlayPosition,
	overlaySize: OverlaySize,
	viewportSize: OverlaySize,
	margin: number,
): OverlayPosition {
	return {
		x: clamp(position.x, margin, viewportSize.width - overlaySize.width - margin),
		y: clamp(position.y, margin, viewportSize.height - overlaySize.height - margin),
	}
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}
