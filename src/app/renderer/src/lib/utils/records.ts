export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getRecordField(
	source: JsonRecord | null,
	key: string,
): JsonRecord | null {
	const value = source?.[key];
	return isRecord(value) ? value : null;
}

export function getStringField(
	source: JsonRecord | null,
	key: string,
): string | null {
	const value = source?.[key];
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function getNumberField(
	source: JsonRecord | null,
	key: string,
): number | null {
	const value = source?.[key];

	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

export function getBooleanField(
	source: JsonRecord | null,
	key: string,
): boolean | null {
	const value = source?.[key];

	if (typeof value === "boolean") {
		return value;
	}

	if (value === 1 || value === "1" || value === "true") {
		return true;
	}

	if (value === 0 || value === "0" || value === "false") {
		return false;
	}

	return null;
}