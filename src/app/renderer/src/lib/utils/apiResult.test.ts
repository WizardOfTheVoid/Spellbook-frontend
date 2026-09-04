import assert from 'node:assert/strict'
import test from 'node:test'
import { unwrap } from './apiResult'

test(`preserves null data from a successful API envelope`, async () => {
	const result = {
		ok: true,
		status: 200,
		statusText: `OK`,
		data: { ok: true, data: null },
	}

	assert.equal(await unwrap<null>(result, `Request failed.`), null)
})
