export type WantedRuntimeConfig = Readonly<{
  messagePrefix: string
  mockMessage: string
  actionMessage: string
}>

export function resolveWantedRuntimeConfig(env: NodeJS.ProcessEnv): WantedRuntimeConfig {
  return Object.freeze({
    messagePrefix: env.WANTED_MESSAGE_PREFIX ?? `[SB Wanted]`,
    mockMessage: env.WANTED_MOCK_MESSAGE ?? `[Mock] "[user]" has been automatically community-[action] for: [type]`,
    actionMessage: env.WANTED_ACTION_MESSAGE ?? `[user]" has been automatically community-[action] for: [type]`
  })
}
