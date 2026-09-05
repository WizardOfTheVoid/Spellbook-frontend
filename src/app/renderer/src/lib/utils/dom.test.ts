import assert from "node:assert/strict"
import test from "node:test"
import { hasFocusedEditableElement } from "./dom"

test(`recognizes every editable control through one selector`, () => {
	let selector = ``
	const editable = {
		closest: (value: string) => {
			selector = value
			return editable
		}
	} as unknown as Element

	assert.equal(hasFocusedEditableElement(editable), true)
	assert.equal(
		selector,
		`input, textarea, select, [contenteditable="true"], [contenteditable=""]`,
	)
	assert.equal(
		hasFocusedEditableElement({ closest: () => null } as unknown as Element),
		false,
	)
	assert.equal(hasFocusedEditableElement(null), false)
})
