import { loadAppEnv } from './appEnv'
import { readPackagedAppConfig } from './config/packagedAppConfig'
import { resolveAntiAfkConfig } from './services/antiAfkConfig'
import { resolveGameActivityConfig } from './services/gameActivityConfig'
import { resolveNotificationPollMs } from './services/notificationPollingConfig'
import { resolveWantedRuntimeConfig } from './services/wantedRuntimeConfig'

loadAppEnv()

export const coreBaseUrl = process.env.CHIV_CORE_URL ?? 'http://127.0.0.1:48125';
export const coreAuthToken = process.env.CHIV_CORE_TOKEN ?? 'on-helluwa-magical-token';
export const developmentServerBaseUrl = (process.env.CHIV_SERVER_URL ?? 'http://127.0.0.1:48126/api/v1').replace(/\/+$/u, '');
export const resolveServerBaseUrl = (isPackaged: boolean, resourcesPath: string): string =>
	isPackaged ? readPackagedAppConfig(resourcesPath).serverBaseUrl : developmentServerBaseUrl
export const serverAuthToken = process.env.CHIV_SERVER_TOKEN?.trim() ?? '';
export const focusMonitorMs = 2000;
export const antiAfkConfig = resolveAntiAfkConfig(process.env)
export const gameActivityConfig = resolveGameActivityConfig(process.env)
export const notificationPollMs = resolveNotificationPollMs(process.env)
export const wantedRuntimeConfig = resolveWantedRuntimeConfig(process.env)
