import { loadAppEnv } from './appEnv'
import { readPackagedAppConfig } from './config/packagedAppConfig'
import { resolveAntiAfkConfig } from './services/antiAfkConfig'
import { resolveNotificationPollMs } from './services/notificationPollingConfig'
import { resolveWantedRuntimeConfig } from './services/wantedRuntimeConfig'
import { resolvePulseConfig } from './services/pulseConfig'

loadAppEnv()

export const coreBaseUrl = process.env.CHIV_CORE_URL ?? 'http://127.0.0.1:48125';
export const coreAuthToken = process.env.CHIV_CORE_TOKEN ?? 'on-helluwa-magical-token';
export const developmentServerBaseUrl = (process.env.CHIV_SERVER_URL ?? 'http://127.0.0.1:48126/api/v1').replace(/\/+$/u, '');
export const resolveServerBaseUrl = (isPackaged: boolean, resourcesPath: string): string =>
	isPackaged ? readPackagedAppConfig(resourcesPath).serverBaseUrl : developmentServerBaseUrl
export const serverAuthToken = process.env.CHIV_SERVER_TOKEN?.trim() ?? '';
export const focusMonitorMs = 2000;
export const antiAfkConfig = resolveAntiAfkConfig(process.env)
const debugInterval = Number(process.env.DEBUG_STATUS_INTERVAL_MS ?? 100)
export const debugStatusIntervalMs = Number.isInteger(debugInterval) && debugInterval > 0 ? debugInterval : 100
const debugLimit = (value: string | undefined, fallback: number): number => {
  const limit = Number(value ?? fallback)
  return Number.isInteger(limit) && limit >= 10 && limit <= 10000 ? limit : fallback
}
export const debugHistoryLimit = debugLimit(process.env.DEBUG_HISTORY_LIMIT, 500)
export const debugRunLimit = debugLimit(process.env.DEBUG_RUN_LIMIT, 100)
export const notificationPollMs = resolveNotificationPollMs(process.env)
export const wantedRuntimeConfig = resolveWantedRuntimeConfig(process.env)
export const pulseConfig = resolvePulseConfig(process.env)
