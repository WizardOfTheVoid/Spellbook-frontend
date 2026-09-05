export type GameActivityConfig = Readonly<{
  recheckMs: number
}>

export function resolveGameActivityConfig(env: NodeJS.ProcessEnv): GameActivityConfig {
  const raw = env.GAME_ACTIVITY_RECHECK_MS?.trim()
  if (!raw) return { recheckMs: 550 }

  const recheckMs = Number(raw)
  if (!Number.isInteger(recheckMs) || recheckMs <= 0) {
    throw new Error(`GAME_ACTIVITY_RECHECK_MS must be a positive integer; received ${raw}.`)
  }

  return { recheckMs }
}
