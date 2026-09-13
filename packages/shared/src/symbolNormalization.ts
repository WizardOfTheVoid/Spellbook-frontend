import symbolMapping from '../assets/symbolNormalization.json'

export type SymbolNormalizer = (value: string) => string
export type SymbolNormalizationEntry = readonly [string, string]

const forbiddenMappingCharacter = /[\r\n\0]/u

export function createSymbolNormalization(mapping: unknown): SymbolNormalizer {
	return createSymbolNormalizer(getSymbolNormalizationEntries(mapping))
}

export function getSymbolNormalizationEntries(mapping: unknown): readonly SymbolNormalizationEntry[] {
	if (!mapping || typeof mapping !== `object` || Array.isArray(mapping)) {
		throw new Error(`Invalid symbolNormalization.json: expected a JSON object`)
	}

	return Object.entries(mapping as Record<string, unknown>)
		.map(([key, value]): [string, string] => {
			if (
				!key ||
				typeof value !== `string` ||
				forbiddenMappingCharacter.test(key) ||
				forbiddenMappingCharacter.test(value)
			) {
				throw new Error(`Invalid symbolNormalization.json: keys must be non-empty single-line strings and values must be single-line strings (empty allowed)`)
			}

			return [key, value]
		})
		.sort(([left], [right]) => right.length - left.length)
}

export const symbolNormalizationEntries = getSymbolNormalizationEntries(symbolMapping)
export const symbolNormalization = createSymbolNormalizer(symbolNormalizationEntries)

function createSymbolNormalizer(entries: readonly SymbolNormalizationEntry[]): SymbolNormalizer {

	if (entries.length === 0) return value => value

	const replacements = new Map(entries)
	const matcher = new RegExp(entries.map(([key]) => escapeRegExp(key)).join(`|`), `gu`)

	return value => value.replace(matcher, match => replacements.get(match)!)
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/gu, `\\$&`)
}
