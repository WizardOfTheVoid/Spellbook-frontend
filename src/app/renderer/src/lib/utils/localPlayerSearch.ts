import Fuse from 'fuse.js'
import { normalizeString } from '@spellbook/shared/normalizeString'
import type { PlayerState } from '$lib/types/playerState'

export function prepareLocalPlayerSearch(players: readonly PlayerState[]) {
  const documents = players.map((player, index) => {
    const originals = [player.name, player.normalizedName, player.dbLatestName, player.dbLatestNormalizedName,
      ...(player.dbPlayer?.names ?? [])].filter((name): name is string => Boolean(name))
    const originalsByName = new Map<string, string>()
    for (const original of originals) {
      const name = normalize(original)
      if (!originalsByName.has(name)) originalsByName.set(name, original)
    }
    const names = [...originalsByName.entries()]
      .filter(([name]) => name.length > 0).map(([value, original]) => ({ value, original }))
    return { player, index, names }
  })
  const fuzzy = new Fuse(documents, { keys: [`names.value`], threshold: 0.3, ignoreLocation: true, isCaseSensitive: true, ignoreFieldNorm: true })

  return {
    search(query: string): PlayerState[] {
      const trimmed = query.trim()
      if (!trimmed) return [...players]
      const exactId = documents.filter(({ player }) => player.playfabId && player.playfabId.toUpperCase() === trimmed.toUpperCase())
      if (exactId.length) return exactId.map(({ player }) => player)
      const term = normalize(trimmed)
      if (!term) return []
      const matched = documents.flatMap(document => {
        let best: { original: string, quality: number } | undefined
        for (const name of document.names) {
          const quality = name.value === term ? 0 : name.value.startsWith(term) ? 1 : name.value.includes(term) ? 2 : 3
          if (quality < (best?.quality ?? 3)) best = { original: name.original, quality }
          if (quality === 0) break
        }
        return best ? [{ ...document, match: best }] : []
      }).sort((left, right) => left.match.quality - right.match.quality || left.index - right.index)
      if (matched.length) return matched.map(({ player, match }) => match.original !== player.name && player.dbPlayer
        ? { ...player, dbPlayer: { ...player.dbPlayer, matchedAlias: match.original } } : player)
      if (/^[a-f0-9]{13,17}$/iu.test(trimmed)) return []
      return fuzzy.search(term).map(({ item }) => item.player)
    }
  }
}

function normalize(value: string): string {
  return normalizeString(`name`, value).toLowerCase()
}
