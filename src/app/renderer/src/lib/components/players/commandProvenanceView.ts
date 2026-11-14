import type { CommandProvenance } from '@spellbook/shared/commandObservations'
import type { PlayerTimelineDetail } from '@spellbook/shared/playerTimeline'

export const commandOriginLabel = (origin: CommandProvenance[`origin`]): string => ({
  external: `Outside SpellBook (inferred)`, spellbook: `SpellBook (inferred)`, unknown: `Unknown`
})[origin]

export function parseCommandProvenance(value: unknown): CommandProvenance[] {
  if (!Array.isArray(value)) throw new Error(`Invalid command provenance.`)
  return value.map(item => {
    if (!item || typeof item.id !== `string` || !item.id || !Number.isSafeInteger(item.actorId) || item.actorId < 1
      || ![`external`, `unknown`, `spellbook`].includes(item.origin) || typeof item.command !== `string`
      || typeof item.observedAtUtc !== `string` || !Number.isFinite(Date.parse(item.observedAtUtc))) throw new Error(`Invalid command provenance.`)
    return { id: item.id, actorId: item.actorId, origin: item.origin, command: item.command, observedAtUtc: item.observedAtUtc }
  })
}

export function commandProvenanceDetails(occurrences: readonly CommandProvenance[] | undefined, superadmin: boolean): PlayerTimelineDetail[] {
  return superadmin ? (occurrences ?? []).flatMap(item => [
    { label: `Command origin`, value: `${commandOriginLabel(item.origin)} · admin #${item.actorId}` },
    { label: `Observed command`, value: item.command, format: `command` as const },
    { label: `Observed at`, value: item.observedAtUtc, format: `dateTime` as const }
  ]) : []
}
