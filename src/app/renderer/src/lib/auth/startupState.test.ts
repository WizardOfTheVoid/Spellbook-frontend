import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { initialStartupState, reduceStartup } from './startupState'

test('settles every startup transition and preserves account access errors', () => {
	assert.deepEqual(initialStartupState, { phase: 'starting', error: null, errorCode: null })
	assert.deepEqual(reduceStartup(initialStartupState, { type: 'restore-started' }), {
		phase: 'restoring-session',
		error: null,
		errorCode: null,
	})
	assert.deepEqual(reduceStartup(initialStartupState, { type: 'authenticated' }), {
		phase: 'authenticated',
		error: null,
		errorCode: null,
	})
	assert.deepEqual(reduceStartup(initialStartupState, { type: 'signed-out' }), {
		phase: 'signed-out',
		error: null,
		errorCode: null,
	})
	assert.deepEqual(reduceStartup(initialStartupState, {
		type: 'restore-failed',
		message: 'Awaiting approval.',
		code: 'ACCOUNT_AWAITING_APPROVAL',
	}), {
		phase: 'signed-out',
		error: 'Awaiting approval.',
		errorCode: 'ACCOUNT_AWAITING_APPROVAL',
	})
})

test('startup overlay retains the approved copy and credit', async () => {
	const directory = dirname(fileURLToPath(import.meta.url))
	const source = await readFile(resolve(directory, '../components/auth/StartupOverlay.svelte'), 'utf8')

	assert.match(source, /Preparing your admin tools…/)
	assert.match(source, /<small>by Magic Trashcan<\/small>/)
})
