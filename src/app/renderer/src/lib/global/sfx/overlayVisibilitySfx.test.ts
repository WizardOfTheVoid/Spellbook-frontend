import assert from 'node:assert/strict'
import test from 'node:test'
import { createOverlayVisibilitySfx } from './overlayVisibilitySfx'

test(`overlay visibility sounds only real transitions after hydration`, () => {
	const cues: string[] = []
	const syncVisibility = createOverlayVisibilitySfx(cue => cues.push(cue))

	syncVisibility(true)
	syncVisibility(true)
	syncVisibility(false)
	syncVisibility(false)
	syncVisibility(true)

	assert.deepEqual(cues, [`close`, `open`])
})
