export const playerEnrichmentBatchSize = 100

export type PlayerEnrichmentResult = { enrichedPlayerIds: number[] }

export class PlayerEnrichmentError extends Error {}

export function parsePlayerEnrichmentIds(value: unknown): string[] {
  const ids = value && typeof value === `object` ? (value as Record<string, unknown>).playfabIds : undefined
  if (!Array.isArray(ids) || !ids.length || ids.length > playerEnrichmentBatchSize
    || ids.some(id => typeof id !== `string` || !id.trim() || id.trim().length > 255)) {
    throw new PlayerEnrichmentError(`playfabIds must contain 1–${playerEnrichmentBatchSize} non-empty player IDs of at most 255 characters.`)
  }
  return [...new Set(ids.map((id: string) => id.trim()))]
}
