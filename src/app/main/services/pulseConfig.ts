import type { CoreActionPriority } from '../../shared/coreAction'

export type PulseConfig = Readonly<{
  getPulseMs(priority: CoreActionPriority, sentinelEnabled?: boolean): number
}>

export function resolvePulseConfig(env: NodeJS.ProcessEnv): PulseConfig {
  const pulses = {
    low: milliseconds(env, `PULSE_LOW_MS`, 5000),
    normal: milliseconds(env, `PULSE_NORMAL_MS`, 2500),
    high: milliseconds(env, `PULSE_HIGH_MS`, 1000),
    sentinel: milliseconds(env, `PULSE_SENTINEL_MS`, 100)
  }
  return Object.freeze({
    getPulseMs: (priority: CoreActionPriority, sentinelEnabled = false) => pulses[sentinelEnabled ? `sentinel` : priority]
  })
}

function milliseconds(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const value = env[key]
  if (value === undefined) return fallback

  const parsed = Number(value.trim())
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 2_147_483_647) {
    throw new Error(`${key} must be an integer between 1 and 2147483647; received ${value}.`)
  }
  return parsed
}
