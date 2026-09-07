import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveToneColor, toneColor } from './tones.js'

test(`lets a component override a tone without changing the shared palette`, () => {
	assert.equal(toneColor(`accent`), `var(--color-accent-tertiary)`)
	assert.equal(
		resolveToneColor(`accent`, `var(--color-accent-primary)`),
		`var(--color-accent-primary)`,
	)
})
