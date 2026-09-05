import type { ActiveBanKind } from "$lib/core"

export function getInitials(value: string): string {
	return (
		value
			.split(/\s+/u)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0]?.toUpperCase() ?? "")
			.join("") || "??"
	);
}

export function formatDateTime(value: string | null | undefined): string {
	if (!value) {
		return "No date";
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString([], {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatFullDateTime(value: string | null | undefined): string {
	if (!value) return "--";

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;

	return date.toLocaleString([], {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function formatRelativeDateTime(
	value: string | null | undefined,
	now = new Date(),
	style: Intl.RelativeTimeFormatStyle = "long",
	locales: Intl.LocalesArgument = [],
): string {
	if (!value) return "--";

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "--";

	const difference = date.getTime() - now.getTime();
	const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
		["year", 365 * 24 * 60 * 60 * 1000],
		["month", 30 * 24 * 60 * 60 * 1000],
		["week", 7 * 24 * 60 * 60 * 1000],
		["day", 24 * 60 * 60 * 1000],
		["hour", 60 * 60 * 1000],
		["minute", 60 * 1000],
	];

	for (const [unit, milliseconds] of units) {
		if (Math.abs(difference) >= milliseconds) {
			return new Intl.RelativeTimeFormat(locales, {
				numeric: "always",
				style,
			}).format(Math.round(difference / milliseconds), unit);
		}
	}

	return "just now";
}

export function formatShortRelativeDateTime(
	value: string | null | undefined,
	now = new Date(),
	locales: Intl.LocalesArgument = [],
): string {
	// Intl short style yields "20 min. ago"; drop the abbreviation dots.
	return formatRelativeDateTime(value, now, "short", locales).replace(/\./gu, "");
}

export function formatHours(value: number | null | undefined): string {
	return typeof value === "number" && Number.isFinite(value) ?
		`${value.toFixed(1)} hours`
	: "--";
}

export function formatCompactHours(value: number | null | undefined): string {
	return typeof value === "number" && Number.isFinite(value)
		? `${Math.round(value)}h`
		: "--"
}

export function isPlayerOnline(player: { livePlayer: unknown | null }): boolean {
	return player.livePlayer !== null
}

export function shouldShowPlayerOnlineIndicator(
	player: { livePlayer: unknown | null },
	mode: "database" | "live",
): boolean {
	return mode === "database" && isPlayerOnline(player)
}

export function playerBanOutlineTone(
	kind: ActiveBanKind | null,
): "danger" | "warning" | null {
	return kind === "hacker" ? "danger" : kind === "other" ? "warning" : null
}

export function formatTime(date: Date): string {
	return date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function formatMetric(value: number | null | undefined): string {
	return typeof value === "number" ? value.toString() : "--";
}
