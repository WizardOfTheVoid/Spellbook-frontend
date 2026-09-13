import {
	getServerApi,
	type AuditLogPage,
	type AuditLogQuery,
	type AuditLogRecord,
} from '$lib/core'
import { unwrap } from './apiResult'
import { isRecord } from './records'

export async function getAuditLogs(query: AuditLogQuery = {}): Promise<AuditLogPage> {
	const value = await unwrap<unknown>(
		await getServerApi().admin.auditLogs.list(query),
		`Audit log request failed.`,
	)
	return parseAuditLogPage(value)
}

export function parseAuditLogPage(value: unknown): AuditLogPage {
	try {
		if (!isRecord(value) || !Array.isArray(value.logs)) throw new Error()
		return {
			logs: value.logs.map(parseAuditLog),
			nextBeforeId: nullablePositiveInteger(value.nextBeforeId),
		}
	} catch {
		throw new Error(`Invalid audit log data.`)
	}
}

export function mergeAuditLogs(
	current: readonly AuditLogRecord[],
	incoming: readonly AuditLogRecord[],
): AuditLogRecord[] {
	const byId = new Map(current.map(log => [log.id, log]))
	for (const log of incoming) if (!byId.has(log.id)) byId.set(log.id, log)
	return [...byId.values()].sort((left, right) => right.id - left.id)
}

function parseAuditLog(value: unknown): AuditLogRecord {
	if (!isRecord(value) || !isRecord(value.meta)) throw new Error()
	return {
		id: positiveInteger(value.id),
		eventType: requiredString(value.eventType),
		outcome: requiredString(value.outcome),
		actorId: nullablePositiveInteger(value.actorId),
		targetType: requiredString(value.targetType),
		targetId: requiredString(value.targetId),
		gameServerId: nullablePositiveInteger(value.gameServerId),
		correlationId: nullableString(value.correlationId),
		meta: value.meta,
		createdAt: requiredString(value.createdAt),
	}
}

function positiveInteger(value: unknown): number {
	if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 1) throw new Error()
	return value
}

function nullablePositiveInteger(value: unknown): number | null {
	return value === null ? null : positiveInteger(value)
}

function requiredString(value: unknown): string {
	if (typeof value !== `string` || value.length < 1) throw new Error()
	return value
}

function nullableString(value: unknown): string | null {
	if (value === null) return null
	if (typeof value !== `string`) throw new Error()
	return value
}
