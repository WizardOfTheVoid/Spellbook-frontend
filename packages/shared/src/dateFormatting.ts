export function formatFullDateTime(value: string | null | undefined, timeZone?: string): string {
	if (!value) return `--`

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return value

	return date.toLocaleString([], {
		timeZone,
		year: `numeric`,
		month: `short`,
		day: `2-digit`,
		hour: `2-digit`,
		minute: `2-digit`,
	})
}

