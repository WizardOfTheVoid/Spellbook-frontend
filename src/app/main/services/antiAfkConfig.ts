export type AntiAfkConfig = Readonly<{
  intervalMs: number
  minimumMovementIdleMs: number
  presses: readonly AntiAfkKeyPress[]
}>

export type AntiAfkKeyPress = Readonly<{
  virtualKey: number
  durationMs: number
}>

const namedVirtualKeys: Readonly<Record<string, number>> = {
  BACKSPACE: 0x08,
  ENTER: 0x0d,
  SHIFT: 0x10,
  CONTROL: 0x11,
  CTRL: 0x11,
  ALT: 0x12,
  PAUSE: 0x13,
  CAPS_LOCK: 0x14,
  ESCAPE: 0x1b,
  ESC: 0x1b,
  SPACE: 0x20,
  SPACEBAR: 0x20,
  PAGE_UP: 0x21,
  PAGE_DOWN: 0x22,
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  INSERT: 0x2d,
  DELETE: 0x2e,
  TAB: 0x09
}

const maximumIntervalSeconds = 2_147_483
const maximumIdleMinutes = 35_791
const maximumDurationMs = 60_000
const defaultKeySequence = 'W:20,S:20'

export function resolveAntiAfkConfig(
  env: NodeJS.ProcessEnv
): AntiAfkConfig {
  const intervalSeconds = resolveInteger(
    env.ANTI_AFK_INTERVAL_SECONDS,
    'ANTI_AFK_INTERVAL_SECONDS',
    60,
    1,
    maximumIntervalSeconds
  )

  return {
    intervalMs: intervalSeconds * 1000,
    minimumMovementIdleMs: resolveInteger(
      env.ANTI_AFK_MINIMUM_IDLE_MINUTES,
      `ANTI_AFK_MINIMUM_IDLE_MINUTES`,
      2,
      1,
      maximumIdleMinutes
    ) * 60_000,
    presses: resolveKeySequence(env.ANTI_AFK_KEYS)
  }
}

function resolveKeySequence(value: string | undefined): AntiAfkKeyPress[] {
  const sequence = value?.trim() || defaultKeySequence

  return sequence.split(',').map((rawEntry, index) => {
    const entry = rawEntry.trim()
    const parts = entry.split(':')
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
      throw new Error(
        `ANTI_AFK_KEYS entry ${index + 1} must use KEY:DURATION_MS.`
      )
    }

    return {
      virtualKey: resolveVirtualKey(parts[0].trim().toUpperCase()),
      durationMs: resolveInteger(
        parts[1],
        `ANTI_AFK_KEYS entry ${index + 1} duration`,
        0,
        0,
        maximumDurationMs
      )
    }
  })
}

function resolveVirtualKey(keyName: string): number {
  if (/^[A-Z0-9]$/u.test(keyName)) return keyName.charCodeAt(0)

  const functionKey = /^F([1-9]|1\d|2[0-4])$/u.exec(keyName)
  if (functionKey) return 0x70 + Number(functionKey[1]) - 1

  const virtualKey = namedVirtualKeys[keyName]
  if (virtualKey !== undefined) return virtualKey

  throw new Error(
    `ANTI_AFK_KEYS must use supported key names, letters, digits, or F1-F24; received ${keyName}.`
  )
}

function resolveInteger(
  value: string | undefined,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const normalized = value?.trim()
  if (!normalized) return fallback

  const parsed = Number(normalized)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}; received ${normalized}.`
    )
  }

  return parsed
}
