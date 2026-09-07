export function formatOffenseType(value: string | null | undefined): string {
	return value?.trim().toLowerCase().replaceAll(`_`, ` `).replace(/\b\w+/gu, word =>
		word === `ffa` ? `FFA` : word[0].toUpperCase() + word.slice(1)
	) || `None`
}
