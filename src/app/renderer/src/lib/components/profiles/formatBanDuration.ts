export function formatBanDuration(hours: number): string {
	if (hours === 999999) return `MAX`
	const [divisor, unit] = hours < 24 ? [1, `hour`] as const
		: hours < 168 ? [24, `day`] as const
		: hours < 720 ? [168, `week`] as const
		: [720, `month`] as const
	const amount = Number((hours / divisor).toFixed(1))
	return `${amount} ${unit}${amount === 1 ? `` : `s`}`
}
