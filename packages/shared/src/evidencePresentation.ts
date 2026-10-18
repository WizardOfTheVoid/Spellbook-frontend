const cheatLabels = {
  flying: `Flying`,
  'server-crash': `Server crash`,
  'one-tap': `One-tap`,
  'no-clip': `No-clip`,
  'item-spawning': `Item spawning`,
  'god-mode': `God mode`,
  'auto-block': `Auto-block`,
  'not-listed': `Not listed`
}

export type CheatSubtype = keyof typeof cheatLabels
export const cheatOptions = Object.entries(cheatLabels).map(([value, label]) => ({ value: value as CheatSubtype, label }))

export function cheatSubtypeLabel(value: string): string {
  return cheatOptions.find(option => option.value === value)?.label ?? value
}

export function formatEvidenceTime(positionMs: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(positionMs) ? positionMs : 0) / 1000)
  const minutes = `${Math.floor(seconds / 60)}`.padStart(2, `0`)
  return `${minutes}:${`${seconds % 60}`.padStart(2, `0`)}`
}
