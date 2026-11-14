export type OverlayVisibilityCue = `open` | `close`

export function createOverlayVisibilitySfx(
	play: (cue: OverlayVisibilityCue) => void,
): (visible: boolean) => void {
	let previous: boolean | null = null

	return visible => {
		if (previous !== null && previous !== visible) {
			play(visible ? `open` : `close`)
		}
		previous = visible
	}
}
