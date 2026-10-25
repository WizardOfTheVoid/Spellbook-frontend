import { writable } from 'svelte/store'
import type { SnapshotLookupDiagnostics } from '@spellbook/shared/snapshotLookup'

export const playerDetectionRuns = writable<SnapshotLookupDiagnostics[]>([])

export function recordPlayerDetection(run: SnapshotLookupDiagnostics) {
  playerDetectionRuns.update(runs => [run, ...runs].slice(0, 30))
}
