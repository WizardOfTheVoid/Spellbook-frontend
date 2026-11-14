type PointerPosition = { clientX: number, clientY: number, pointerId: number }

export class RangeGesture {
	private origin: PointerPosition | null = null
	private dragging = false

	start(point: PointerPosition) {
		this.origin = { clientX: point.clientX, clientY: point.clientY, pointerId: point.pointerId }
		this.dragging = false
	}

	move(point: PointerPosition) {
		if (!this.origin || point.pointerId !== this.origin.pointerId) return false
		this.dragging ||= Math.hypot(point.clientX - this.origin.clientX, point.clientY - this.origin.clientY) > 4
		return this.dragging
	}

	finish(point: PointerPosition) {
		if (!this.origin || point.pointerId !== this.origin.pointerId) return null
		const result = this.move(point) ? `drag` : `edit`
		this.cancel()
		return result
	}

	cancel() {
		this.origin = null
		this.dragging = false
	}
}

export function nearestRangeHandle(position: number, minimum: number, maximum: number) {
	if (minimum === maximum && position > maximum) return `maximum`
	return Math.abs(position - minimum) <= Math.abs(position - maximum) ? `minimum` : `maximum`
}
