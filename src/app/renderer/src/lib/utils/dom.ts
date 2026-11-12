export function hasFocusedEditableElement(
	activeElement: Element | null = document.activeElement,
): boolean {
	return Boolean(
		activeElement?.closest(
			`input, textarea, select, [contenteditable="true"], [contenteditable=""]`,
		),
	)
}
