import assert from "node:assert/strict"
import test from "node:test"
import {
	markAutoHelpDisplayed,
	nextAutoHelpView,
	parseChangelog,
	onHelpRequested,
	requestHelp,
} from "./helpNotice"

test(`replays help requests and removes the listener when its view unmounts`, () => {
	const opened: string[] = []
	const stop = onHelpRequested(view => opened.push(view))
	requestHelp(`welcome`)
	requestHelp(`welcome`)
	requestHelp(`changelogs`)
	stop()
	requestHelp(`welcome`)
	assert.deepEqual(opened, [`welcome`, `welcome`, `changelogs`])
})

test(`keeps a notice eligible until the modal is displayed`, () => {
	const storage = memoryStorage()

	assert.equal(nextAutoHelpView(storage, 7, `1.6.1`), `welcome`)
	assert.equal(nextAutoHelpView(storage, 7, `1.6.1`), `welcome`)

	markAutoHelpDisplayed(storage, 7, `1.6.1`, `welcome`)
	assert.equal(nextAutoHelpView(storage, 7, `1.6.1`), null)
	assert.equal(nextAutoHelpView(storage, 7, `1.6.2`), `changelogs`)
})

test(`tracks welcome and changelogs independently for each user`, () => {
	const storage = memoryStorage()

	markAutoHelpDisplayed(storage, 7, `1.6.1`, `welcome`)
	markAutoHelpDisplayed(storage, 7, `1.6.2`, `changelogs`)

	assert.equal(nextAutoHelpView(storage, 7, `1.6.2`), null)
	assert.equal(nextAutoHelpView(storage, 8, `1.6.2`), `welcome`)
})

test(`parses bundled changelog releases newest first`, () => {
	assert.deepEqual(parseChangelog(`
# Changelog

## 1.0.0

- First release

## 1.1.0

- New feature
- Fix
`), [
		{ version: `1.1.0`, notes: [`New feature`, `Fix`] },
		{ version: `1.0.0`, notes: [`First release`] },
	])
})

function memoryStorage(): Storage {
	const values = new Map<string, string>()
	return {
		getItem: key => values.get(key) ?? null,
		setItem: (key, value) => { values.set(key, value) },
		removeItem: key => { values.delete(key) },
		clear: () => { values.clear() },
		key: index => [...values.keys()][index] ?? null,
		get length() { return values.size },
	} as Storage
}
