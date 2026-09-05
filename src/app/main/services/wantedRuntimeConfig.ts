export type WantedRuntimeConfig = Readonly<{
  listPlayersPollMs: number
  listPlayersSentinelPollMs: number
  wantedPollMs: number
  wantedSentinelPollMs: number
  messagePrefix: string
  mockMessage: string
  actionMessage: string
}>

const maximumTimerSeconds = 2_147_483

export function resolveWantedRuntimeConfig(env: NodeJS.ProcessEnv): WantedRuntimeConfig {
  return Object.freeze({
    listPlayersPollMs: seconds(env, `LISTPLAYERS_POLL_SECONDS`, 15),
    listPlayersSentinelPollMs: seconds(env, `LISTPLAYERS_SENTINEL_POLL_SECONDS`, 5),
    wantedPollMs: seconds(env, `WANTED_POLL_SECONDS`, 5),
    wantedSentinelPollMs: seconds(env, `WANTED_SENTINEL_POLL_SECONDS`, 2),
    messagePrefix: env.WANTED_MESSAGE_PREFIX ?? `[SB Wanted]`,
    mockMessage: env.WANTED_MOCK_MESSAGE ?? `[Mock] "[user]" has been automatically community-[action] for: [type]`,
    actionMessage: env.WANTED_ACTION_MESSAGE ?? `[user]" has been automatically community-[action] for: [type]`
  })
}

function seconds(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = env[key]
  if (value === undefined) return fallback * 1_000

  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximumTimerSeconds) {
    throw new Error(`${key} must be an integer between 1 and ${maximumTimerSeconds}; received ${value}.`)
  }

  return parsed * 1_000
}
