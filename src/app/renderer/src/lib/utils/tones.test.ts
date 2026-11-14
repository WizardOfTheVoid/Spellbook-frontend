import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveIconColor, resolveToneColor, toneColor } from './tones.js'

test(`lets a component override a tone without changing the shared palette`, () => {
	assert.equal(toneColor(`accent`), `var(--color-accent-tertiary)`)
	assert.equal(
		resolveToneColor(`accent`, `var(--color-accent-primary)`),
		`var(--color-accent-primary)`,
	)
})

test(`resolves icon foreground tones while retaining inherited and caller-provided colors`, () => {
	assert.equal(resolveIconColor(), `inherit`)
	assert.equal(resolveIconColor(`inherit`), `inherit`)
	assert.equal(resolveIconColor(`success`), `var(--color-accent-secondary)`)
	assert.equal(resolveIconColor(`warning`), `var(--color-accent-tertiary)`)
	assert.equal(resolveIconColor(`var(--color-accent-primary)`), `var(--color-accent-primary)`)
	assert.equal(resolveIconColor(`#123456`), `#123456`)
})
