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

export type DateStampFormat = `date` | `dateTime` | `time`

export function formatDateStamp(
	value: string | null | undefined,
	format: DateStampFormat,
	timeZone: string,
	locales?: Intl.LocalesArgument,
): string {
	const date = new Date(value ?? ``)
	if (Number.isNaN(date.getTime())) return `—`
	if (format === `time`) {
		return new Intl.DateTimeFormat(locales, {
			timeZone,
			hour: `2-digit`,
			minute: `2-digit`,
			hourCycle: `h23`,
		}).format(date)
	}

	return new Intl.DateTimeFormat(locales, {
		timeZone,
		...(format === `date` ? { dateStyle: `long` as const } : {}),
		...(format === `dateTime` ? { dateStyle: `medium` as const } : {}),
		...(format === `dateTime` ? { timeStyle: `short` as const } : {}),
	}).format(date)
}

export function formatFullDateStamp(
	value: string | null | undefined,
	timeZone: string,
	locales?: Intl.LocalesArgument,
): string {
	const date = new Date(value ?? ``)
	if (Number.isNaN(date.getTime())) return `—`

	return new Intl.DateTimeFormat(locales, {
		timeZone,
		dateStyle: `full`,
		timeStyle: `long`,
	}).format(date)
}

