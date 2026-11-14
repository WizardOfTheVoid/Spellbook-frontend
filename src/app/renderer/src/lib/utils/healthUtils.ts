import {
	getBooleanField,
	getNumberField,
	getRecordField,
	getStringField,
} from "./records";
import type { JsonRecord } from "./records";

export function getHealthRunning(source: JsonRecord | null): boolean | null {
	const direct = getBooleanField(source, "running");
	if (direct !== null) {
		return direct;
	}

	return getBooleanField(getRecordField(source, "health"), "running");
}

export function formatRunning(value: boolean | null): string {
	return (
		value === true ? "Running"
		: value === false ? "Stopped"
		: "Unknown"
	);
}

export function formatOverlayDetail(source: JsonRecord | null): string {
	if (getBooleanField(source, "focused") === true) {
		return "Focused";
	}

	if (getBooleanField(source, "visible") === true) {
		return "Visible";
	}

	return "Idle";
}

export function formatComponentDetail(source: JsonRecord | null): string {
	const status = getNumberField(source, "status");
	const statusText = getStringField(source, "statusText");
	const baseUrl = getStringField(source, "baseUrl");

	if (status) {
		return statusText ? `${status} ${statusText}` : status.toString();
	}

	return baseUrl ?? "No response";
}

export function formatPlayFabDetail(source: JsonRecord | null): string {
	const health = getRecordField(source, "health") ?? source
	return getStringField(health, "status") ?? formatComponentDetail(source)
}

export function formatDatabaseDetail(source: JsonRecord | null): string {
	const health = getRecordField(source, "health") ?? source;
	const error = getStringField(health, "error");
	const database = getStringField(health, "database");
	const host = getStringField(health, "host");

	if (error) {
		return error;
	}

	if (database && host) {
		return `${database} @ ${host}`;
	}

	return formatComponentDetail(source);
}

export function formatGameDetail(source: JsonRecord | null): string {
	const processStatus = getRecordField(source, "processStatus");
	const process = getRecordField(source, "process");
	const statusMessage = getStringField(processStatus, "message");
	const processName = getStringField(process, "name") ?? getStringField(process, "Name");
	const processId = getNumberField(process, "id") ?? getNumberField(process, "Id");

	if (processName && processId) {
		return `${processName} #${processId}`;
	}

	return processName ?? statusMessage ?? "No target";
}

export function formatLatency(source: JsonRecord | null): string {
	const latencyMs = getLatencyMs(source);
	return latencyMs === null ? "-- ms" : `${Math.round(latencyMs)} ms`;
}

function getLatencyMs(source: JsonRecord | null): number | null {
	return (
		getNumberField(source, "latencyMs") ??
		getNumberField(getRecordField(source, "health"), "latencyMs")
	);
}
