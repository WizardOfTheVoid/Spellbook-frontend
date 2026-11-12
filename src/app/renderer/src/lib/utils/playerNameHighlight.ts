import { normalizeString } from '@spellbook/shared/normalizeString'

export function playerNameHighlight(name: string, search: string): { before: string; match: string; after: string } {
	const plain = { before: name, match: ``, after: `` }
	const query = normalizeString(`name`, search).toLowerCase()
	if (!query || /^[0-9A-F]{13,17}$/u.test(search.trim())) return plain

	const normalized = normalizeString(`name`, name).toLowerCase()
	const start = normalized.indexOf(query)
	if (start < 0 || ([...query].length < 3 && start !== 0)) return plain
	const end = start + query.length
	let matchStart = 0
	let matchEnd = name.length

	if (normalized === name.toLowerCase()) {
		matchStart = start
		matchEnd = end
	} else {
		let offset = 0
		for (const character of name) {
			offset += character.length
			const length = normalizeString(`name`, name.slice(0, offset)).toLowerCase().length
			if (length <= start) matchStart = offset
			if (length >= end) {
				matchEnd = offset
				break
			}
		}
	}

	return { before: name.slice(0, matchStart), match: name.slice(matchStart, matchEnd), after: name.slice(matchEnd) }
}
