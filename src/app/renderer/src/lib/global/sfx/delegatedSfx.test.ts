import assert from "node:assert/strict"
import test from "node:test"
import { playDefaultButtonSfx } from "./delegatedSfx"

test(`delegated fallback plays only for buttons without a sound owner`, () => {
	let played = 0
	const play = () => { played += 1 }

	playDefaultButtonSfx(target(button()), play)
	playDefaultButtonSfx(target(button(`data-uisfx`)), play)
	playDefaultButtonSfx(target(button(`data-uisfx-ignore`)), play)

	assert.equal(played, 1)
})

type TestButton = {
	closest: (selector: string) => TestButton | null
	hasAttribute: (name: string) => boolean
}

function button(attribute: string | null = null): TestButton {
	const value = {
		closest: (selector: string) => selector === `button` ? value : null,
		hasAttribute: (name: string) => name === attribute
	}
	return value
}

function target(value: TestButton): Element {
	return { closest: value.closest } as unknown as Element
}
