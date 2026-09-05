const defaultNotificationPollSeconds = 12
const maximumNotificationPollSeconds = 2_147_483

export function resolveNotificationPollMs(env: NodeJS.ProcessEnv): number {
  const normalized = env.NOTIFICATION_POLL_SECONDS?.trim()
  if (!normalized) return defaultNotificationPollSeconds * 1_000

  const seconds = Number(normalized)
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > maximumNotificationPollSeconds) {
    throw new Error(
      `NOTIFICATION_POLL_SECONDS must be an integer between 1 and ${maximumNotificationPollSeconds}; received ${normalized}.`
    )
  }

  return seconds * 1_000
}
