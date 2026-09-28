type WantedPlayerInput = { playfabId: string, mock: boolean, source: string }

export async function addWantedPlayers(
	input: string,
	mock: boolean,
	source: string,
	create: (input: WantedPlayerInput) => Promise<unknown>,
): Promise<{ added: number, failed: { playfabId: string, error: string }[] }> {
	const ids = new Set(input.split(/[,;]/).map(value => value.trim()).filter(Boolean))
	const manualSource = source.trim() || `SpellBook`
	const failed: { playfabId: string, error: string }[] = []
	let added = 0

	for (const playfabId of ids) {
		try {
			await create({ playfabId, mock, source: manualSource })
			added += 1
		} catch (error) {
			failed.push({
				playfabId,
				error: error instanceof Error ? error.message : `Wanted player could not be added.`,
			})
		}
	}

	return { added, failed }
}
