export function playDefaultButtonSfx(
	target: Element | null,
	play: () => void
): void {
	const button = target?.closest(`button`)
	if (
		!button
		|| button.hasAttribute(`data-uisfx`)
		|| button.hasAttribute(`data-uisfx-ignore`)
	) return
	play()
}
