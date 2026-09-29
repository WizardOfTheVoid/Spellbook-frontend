import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiResultError, unwrap } from './apiResult'

test(`preserves null data from a successful API envelope`, async () => {
	const result = {
		ok: true,
		status: 200,
		statusText: `OK`,
		data: { ok: true, data: null },
	}

	assert.equal(await unwrap<null>(result, `Request failed.`), null)
})

test(`preserves response status when an API result fails`, async () => {
	const result = {
		ok: false,
		status: 404,
		statusText: `Not Found`,
		data: { ok: false, error: { code: `TEAM_NOT_FOUND`, message: `Team unavailable.` } },
	}

	await assert.rejects(
		unwrap<unknown>(result, `Request failed.`),
		(error: unknown) => error instanceof ApiResultError
			&& error.status === 404
			&& error.message === `Team unavailable.`
	)
})
