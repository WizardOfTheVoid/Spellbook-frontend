import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuditLogQuery, CoreCallResult } from '$lib/core'
import { getAuditLogs, mergeAuditLogs, parseAuditLogPage } from './auditLogsApi'

test(`forwards exact audit filters and strictly parses the cursor page`, async () => {
	const queries: AuditLogQuery[] = []
	const page = { logs: [auditLog(9), auditLog(8)], nextBeforeId: 8 }
	const restore = installApi(async query => {
		queries.push(query)
		return result(page)
	})
	const query: AuditLogQuery = {
		beforeId: 10,
		eventType: `wanted.executed`,
		actorId: 3,
		targetType: `player`,
		targetId: `42`,
		gameServerId: 7,
		outcome: `success`,
		createdFrom: `2026-08-01T00:00:00.000Z`,
		createdTo: `2026-08-31T23:59:59.999Z`,
		limit: 50,
	}

	try {
		assert.deepEqual(await getAuditLogs(query), page)
		assert.deepEqual(queries, [query])
	} finally {
		restore()
	}
})

test(`rejects malformed audit envelopes and metadata`, () => {
	for (const value of [
		{ logs: {}, nextBeforeId: null },
		{ logs: [auditLog(1)], nextBeforeId: 0 },
		{ logs: [{ ...auditLog(1), meta: [] }], nextBeforeId: null },
		{ logs: [{ ...auditLog(1), actorId: `3` }], nextBeforeId: null },
	]) {
		assert.throws(() => parseAuditLogPage(value), /Invalid audit log data\./)
	}
})

test(`deduplicates appended logs newest first`, () => {
	assert.deepEqual(
		mergeAuditLogs([auditLog(9), auditLog(8)], [auditLog(8), auditLog(7)]).map(log => log.id),
		[9, 8, 7],
	)
})

function installApi(list: (query: AuditLogQuery) => Promise<CoreCallResult>): () => void {
	const original = Object.getOwnPropertyDescriptor(globalThis, `window`)
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: { chivServer: { admin: { auditLogs: { list } } } },
	})
	return () => {
		if (original) Object.defineProperty(globalThis, `window`, original)
		else delete (globalThis as { window?: unknown }).window
	}
}

function auditLog(id: number) {
	return {
		id,
		eventType: `wanted.executed`,
		outcome: `success`,
		actorId: 3,
		targetType: `player`,
		targetId: `42`,
		gameServerId: 7,
		correlationId: `wanted:4:9:7`,
		meta: { sourceActionId: 9, markup: `<script>ignored as text</script>` },
		createdAt: `2026-08-31T12:00:00.000Z`,
	}
}

function result(data: unknown): CoreCallResult {
	return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data } }
}
