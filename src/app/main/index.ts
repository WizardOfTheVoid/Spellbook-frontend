import type { RulesetDebugSnapshot } from '@spellbook/shared/rulesets/ruleDiagnostics'
import { ActionWorker } from './services/actions/actionWorker'
import { ActionHandler } from './services/actions/actionHandler'
import { ActionClient } from './services/actions/actionClient'
import { app, dialog, ipcMain, Menu, net, protocol, shell, Tray } from 'electron'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path';
import { CoreRequestPayloadFactory } from './api/core-request-payload-factory'
import { HttpClient } from './api/http-client';
import { antiAfkConfig, coreAuthToken, coreBaseUrl, debugHistoryLimit, debugRunLimit, debugStatusIntervalMs, focusMonitorMs, notificationPollMs, resolveServerBaseUrl, serverAuthToken, pulseConfig } from './config'
import { FocusMonitor } from './focus/focus-monitor';
import { FocusStateFactory } from './focus/focus-state-factory';
import { FocusStateLogger } from './focus/focus-state-logger';
import { AppHealthService } from './health/app-health-service';
import { IpcHandlerRegistry } from './ipc/ipc-handler-registry';
import { RequestIdFactory } from './request-id-factory';
import { AppSettingsService } from './services/app-settings-service';
import { ListPlayersService } from './services/list-players-service';
import { OverlayActivityGuard } from './services/overlay-activity-guard';
import { OverlayInputFocusSync } from './services/overlayInputFocusSync'
import { OverlayWindowController } from './window/overlay-window-controller';
import { OverlayWindowFactory } from './window/overlay-window-factory';
import { ShortcutRegistry } from './window/shortcut-registry';
import { SnapshotLookupService } from './services/snapshot-lookup-service';
import { ToastWindowController } from './window/toast-window-controller';
import { ToastWindowFactory } from './window/toast-window-factory';
import { AuthSessionStore } from './services/auth-session-store';
import { AuthIpcHandlers } from './ipc/auth-ipc-handlers';
import { AntiAfkService } from './services/anti-afk-service'
import { AntiAfkStatusWindowController } from './window/anti-afk-status-window-controller'
import { AntiAfkStatusWindowFactory } from './window/anti-afk-status-window-factory'
import { CurrentGameSnapshotStore } from './services/currentGameSnapshotStore'
import { GameStateService } from './gameState/gameStateService'
import { ListPlayersPoller } from './services/listPlayersPoller'
import { MainRuntimeCoordinator, type MainAuthState } from './services/mainRuntimeCoordinator'
import { MaintenanceMonitor } from './maintenance/maintenanceMonitor'
import { readMaintenanceStatus } from './maintenance/maintenanceIpc'
import { maintenanceOperational } from '../shared/maintenance'
import { maintenanceMessage } from '@spellbook/shared/maintenance'
import { CommandHistoryService } from './commandHistory/commandHistoryService'
import { CommandObservationReporter } from './commandHistory/commandObservationReporter'
import type { CommandObservationResult } from '@spellbook/shared/commandObservations'
import { ConsoleSetupService } from './consoleSetup/consoleSetupService'
import { ConsoleBindingStore } from './consoleSetup/consoleBindingStore'
import { ConsoleBindingProbe } from './consoleSetup/consoleBindingProbe'
import { RuntimeQuitGuard } from './services/runtimeQuitGuard'
import { initializeWindowBeforeAuth, sessionInvalidationHandler } from './services/mainRuntimeWiring'
import { SentinelService } from './services/sentinelService'
import { SentinelBorderWindowController } from './window/sentinelBorderWindowController'
import { SentinelBorderWindowFactory } from './window/sentinelBorderWindowFactory'
import { GameCommandEligibility } from './services/gameCommandEligibility'
import { ManualActionAccess } from './services/actions/manualActionAccess'
import { createDebugTools } from './debug/debugIntegration'
import { DebugWindowController } from './window/debugWindowController'
import { DebugWindowFactory } from './window/debugWindowFactory'
import { appIdentity } from '@spellbook/shared/appIdentity'
import { findAppProtocolUrl } from './appProtocol'
import { AppLinkInbox } from './appLinks/appLinkInbox'
import { AppLinkWindowFocus } from './appLinks/appLinkWindowFocus'
import { resolveAppIconPath } from './window/appIconPath'
import { AppTrayController } from './window/appTrayController'
import { Chivalry2InstallationService } from './gameInstallations/chivalry2InstallationService'
import { productVersion } from '@spellbook/shared/productVersion'
import { CoreProcessController } from './core/coreProcessController'
import { reserveLoopbackPort } from './core/corePort'
import { resolveCoreExecutable } from './core/coreRuntimePath'
import { startApplication } from './services/applicationStartup'
import { AppUpdateService } from './services/appUpdateService'
import { UserActivityReporter } from './services/userActivityReporter'
import { GamePresenceReporter } from './services/gamePresenceReporter'
import { CurrentServerReporter } from './services/currentServerReporter'
import { installRendererProtocol, registerRendererScheme } from './window/rendererRoute'
import { DiagnosticLogService } from './services/diagnosticLogService'
import { captureDiagnosticConsole } from '../shared/diagnosticLogFormatting'
import { createUserAgent } from '@spellbook/shared/userAgent'


registerRendererScheme(protocol)
app.setName(appIdentity.name)
app.userAgentFallback = createUserAgent(`client`)
let loggedInUserId: number | null = null
const diagnosticLogs = new DiagnosticLogService(join(app.getPath(`userData`), `logs`))
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (hasSingleInstanceLock) {
	captureDiagnosticConsole(console, (level, message) => diagnosticLogs.write(`main`, { level, message }))
	diagnosticLogs.write(`main`, { level: `info`, message: `SpellBook ${productVersion} started (${process.platform}, Electron ${process.versions.electron}).` })
}
const requestIds = new RequestIdFactory('overlay');
let focusMonitor: FocusMonitor;
const appSettingsService = new AppSettingsService();
const appIconPath = resolveAppIconPath({
	isPackaged: app.isPackaged,
	appPath: app.getAppPath(),
	resourcesPath: process.resourcesPath
})
const overlayWindowFactory = new OverlayWindowFactory(
	__dirname,
	() => appSettingsService.getSelectedDisplay(),
	appIconPath
)
const overlayWindowController = new OverlayWindowController(overlayWindowFactory, () => {
	void focusMonitor.refresh();
});
const gameInstallations = new Chivalry2InstallationService()
const appTrayController = new AppTrayController({
	appName: appIdentity.name,
	iconPath: appIconPath,
	getVersion: () => app.getVersion(),
	getInstalledEditions: () => gameInstallations.detect(),
	onLaunchGame: async edition => {
		await shell.openExternal(await gameInstallations.getLaunchUrl(edition))
	},
	onLaunchError: (edition, error) => {
		console.error(`Chivalry 2 ${edition} launch failed.`, error)
		dialog.showErrorBox(`Chivalry 2 could not start`, error instanceof Error ? error.message : `Open ${edition} and try again.`)
	},
	createTray: iconPath => new Tray(iconPath),
	buildMenu: template => Menu.buildFromTemplate(template),
	onToggle: () => overlayWindowController.toggle(),
	onNavigate: destination => {
		overlayWindowController.show()
		overlayWindowController.sendToCurrent(`overlay:navigate`, destination)
	},
	onError: error => console.error(`Tray setup failed.`, error)
})
const coreRequestPayloads = new CoreRequestPayloadFactory(() => overlayWindowController.getOrCreate())
const httpClient: HttpClient = new HttpClient({
	coreBaseUrl,
	coreAuthToken,
	serverBaseUrl: resolveServerBaseUrl(app.isPackaged, process.resourcesPath),
	serverAuthToken,
	getConsoleKey: () => appSettingsService.getSettings().consoleKey,
	getOwnPlayfabId: (): string | null => authIpcHandlers.playfabId,
  getUserId: () => loggedInUserId,
  getMessageServerId: (): number | null => {
    const snapshot = currentGameSnapshots.get()
    return gameState.isInGameServer() && snapshot && Date.now()-Date.parse(snapshot.observedAt)<45000 ? snapshot.gameServerId : null
  },
	allowAction: (body): boolean => consoleSetup.allowAction(body),
  prepareAction: action => consoleSetup.prepareAction(action),
	getActionIssue: (): string | null => consoleSetup.getState().commandIssue,
	getMaintenanceIssue: (): { code: string, message: string } | null => {
    const state = maintenanceMonitor.snapshot()
    if (state.maintenance?.enabled) return { code: `MAINTENANCE_MODE`, message: maintenanceMessage(state.maintenance) }
    return state.initialized ? null : { code: `SERVER_UNAVAILABLE`, message: `Checking SpellBook availability.` }
  },
	getSentinelEnabled: (): boolean => sentinelService.getState().enabled
}, coreRequestPayloads)
const maintenanceMonitor: MaintenanceMonitor = new MaintenanceMonitor({
  read: signal => readMaintenanceStatus(httpClient, signal),
  save: state => appSettingsService.saveMaintenanceSnapshot(httpClient.serverBaseUrl, state)
})
const shortcutRegistry = new ShortcutRegistry(overlayWindowController, () => {
  if (maintenanceOperational(maintenanceMonitor.snapshot())) void snapshotLookupService.run()
}, {
  toggle: () => {
    void appSettingsService.updateSettings({ debug: !appSettingsService.getSettings().debug })
      .catch(error => console.error(`Debug toggle failed.`, error))
  },
  toggleHud: () => debugTools.toggleHud()
})
appSettingsService.setKeybindHandler(settings => {
  shortcutRegistry.apply(settings)
  appTrayController.refresh(settings.overlayKey)
})
function setKeybindRecording(recording: boolean): void {
  shortcutRegistry.setRecording(recording)
  overlayWindowController.setKeybindRecording(recording)
}
ipcMain.handle(`settings:record-keybind`, (event, recording: unknown) => {
  const window = overlayWindowController.getCurrent()
  if (event.sender !== window?.webContents || typeof recording !== `boolean`) return
  setKeybindRecording(recording && window.isFocused())
})
const focusStateFactory = new FocusStateFactory(overlayWindowController);
const focusStateLogger = new FocusStateLogger();
const overlayInputFocus = new OverlayInputFocusSync(httpClient, () => {
  const window = overlayWindowController.getCurrent()
  return window && !window.isDestroyed() ? coreRequestPayloads.appTarget() : null
})
const overlayActivity = new OverlayActivityGuard(overlayWindowController, focused => overlayInputFocus.publish(focused))
const antiAfkStatusWindow = new AntiAfkStatusWindowController(
	new AntiAfkStatusWindowFactory(__dirname, () => appSettingsService.getSelectedDisplay())
)
const antiAfkService = new AntiAfkService(
	httpClient,
	requestIds,
	focusStateFactory,
	antiAfkStatusWindow,
	overlayActivity,
	antiAfkConfig
)
focusMonitor = new FocusMonitor(httpClient, focusStateFactory, focusStateLogger, focusMonitorMs, () => overlayActivity.isOverlayActive());
const appHealthService = new AppHealthService(httpClient, focusMonitor, overlayWindowController, requestIds);
const listPlayersService = new ListPlayersService(httpClient, requestIds, overlayActivity,
  (result, key) => consoleSetup.observeListPlayers(result, key), () => currentGameSnapshots.invalidationVersion)
const currentGameSnapshots = new CurrentGameSnapshotStore()
const gameState = new GameStateService(httpClient, currentGameSnapshots)
const actionAccess = new ManualActionAccess(httpClient, currentGameSnapshots, gameState)
const commandBinding = () => {
  const snapshot = currentGameSnapshots.get()
  const authEpoch = httpClient.authenticatedEpoch
  return gameState.isInGameServer() && snapshot && Date.now() - Date.parse(snapshot.observedAt) < 45000 && authEpoch !== null
    ? { clientId: listPlayersService.clientId, gameServerId: snapshot.gameServerId, generation: currentGameSnapshots.invalidationVersion, authEpoch } : null
}
const commandHistory = new CommandHistoryService({ callCore: (path, init) => httpClient.callCore(path, init), game: gameState,
  appProcessId: process.pid, getBinding: commandBinding })
const commandReporter = new CommandObservationReporter({ subscribe: listener => commandHistory.subscribeObservations(listener),
  context: () => JSON.stringify(commandBinding()), status: state => commandHistory.setReporting(state),
  post: async (input, signal) => {
    const response = await httpClient.postServer(`/command-observations`, input, signal)
    const envelope = response.data as { ok?: boolean, data?: CommandObservationResult } | null
    if (!response.ok || envelope?.ok !== true || envelope.data?.id !== input.id
      || ![`recorded`, `retained`, `duplicate`].includes(envelope.data.status)) throw new Error(`Observation upload failed.`)
    return envelope.data
  } })
const sentinelService = new SentinelService(antiAfkService)
const sentinelBorderWindow = new SentinelBorderWindowController(
	new SentinelBorderWindowFactory(__dirname, () => appSettingsService.getSelectedDisplay())
)
sentinelService.subscribe(({ enabled }) => sentinelBorderWindow.setEnabled(enabled))
const gameCommandEligibility = new GameCommandEligibility(overlayWindowController, sentinelService)
const debugWindow = new DebugWindowController(
	new DebugWindowFactory(__dirname, () => appSettingsService.getSelectedDisplay())
)
const listPlayersPoller = new ListPlayersPoller(
	listPlayersService,
	currentGameSnapshots,
	sentinelService,
	pulseConfig,
	gameCommandEligibility,
	gameState
)
const actionWorker = new ActionWorker(new ActionClient(httpClient), new ActionHandler(httpClient), currentGameSnapshots,
  id => httpClient.callCore(`/v3/actions/${encodeURIComponent(id)}/cancel`, { method: `POST` }))
const consoleSetup = new ConsoleSetupService(httpClient, () => appSettingsService.getSettings().consoleKey,
  new ConsoleBindingProbe(httpClient), new ConsoleBindingStore(join(app.getPath(`userData`), `console-verification.json`)),
  async key => { await appSettingsService.updateSettings({ consoleKey: key }) })
let commandsBlocked = false
consoleSetup.subscribe(state => {
  const readinessChanged = state.commandsBlocked !== commandsBlocked
  if (state.commandsBlocked && !commandsBlocked) httpClient.cancelGameActions()
  commandsBlocked = state.commandsBlocked
  void antiAfkService.setConsoleSetupReady(!state.commandsBlocked)
  if (readinessChanged) void runtime.transition({ ...runtimeAuth, operational, consoleSetupReady: !state.commandsBlocked })
})
const runtime = new MainRuntimeCoordinator([commandReporter, commandHistory, consoleSetup], currentGameSnapshots, undefined, [listPlayersPoller, actionWorker])
const debugTools = createDebugTools({
  getRulesetStatus: async () => {
    const gameServerId = currentGameSnapshots.get()?.gameServerId
    if (!gameServerId) return null
    const response = await httpClient.getServer(`/admin/actions/ruleset-debug`, { gameServerId })
    if (currentGameSnapshots.get()?.gameServerId !== gameServerId) return null
    const envelope = response.data as { ok?: boolean, data?: RulesetDebugSnapshot, error?: { message?: string } } | null
    if (!response.ok || envelope?.ok === false || !envelope?.data) throw new Error(envelope?.error?.message ?? response.error?.message ?? `Ruleset debug unavailable`)
    return envelope.data
  },
  getAppMetrics: () => app.getAppMetrics(),
	http: httpClient, actionAccess, appTarget: () => coreRequestPayloads.appTarget(),
	getConsoleKey: () => appSettingsService.getSettings().consoleKey,
	overlay: overlayWindowController, display: debugWindow,
	producers: { listPlayers: listPlayersPoller, actions: actionWorker, antiAfk: antiAfkService },
	configPath: join(app.getPath(`userData`), `debug-tests.json`), intervalMs: debugStatusIntervalMs,
	eventLimit: debugHistoryLimit, runLimit: debugRunLimit,
	selectDestination: async () => {
		const window = overlayWindowController.getCurrent()
		if (!window) return null
		const result = await dialog.showSaveDialog(window, {
			title: `Save Debug recording`, defaultPath: `SpellBook-debug-${Date.now()}.json`,
			filters: [{ name: `JSON recording`, extensions: [`json`] }]
		})
		return result.canceled ? null : result.filePath ?? null
	}
})
appSettingsService.setChangeHandler(settings => {
  consoleSetup.settingsChanged()
	void debugTools.setEnabled(settings.debug).catch(error => console.error(`Debug state update failed.`, error))
})
let coreProcessController: CoreProcessController | null = null
const toastWindowController = new ToastWindowController(
	new ToastWindowFactory(__dirname, () => appSettingsService.getSelectedDisplay()),
	async () => {
		if (overlayWindowController.isForegroundInteractive()) return false
		const meta = await httpClient.callCore(`/v2/meta/get`, { method: `GET` })
		return !overlayWindowController.isForegroundInteractive() && focusStateFactory.create(meta).gameIsFocused
	},
)
app.on(`browser-window-focus`, () => setImmediate(() => toastWindowController.raise()))
const snapshotLookupService = new SnapshotLookupService(httpClient, overlayWindowController, requestIds);
const authSessions = new AuthSessionStore()
const userActivity = new UserActivityReporter(productVersion, body => httpClient.postServer(`/auth/activity`, body))
const gamePresence = new GamePresenceReporter(currentGameSnapshots, () => gameState.get(), body => httpClient.postServer(`/dashboard/presence`, body))
const currentConnection = new CurrentServerReporter(currentGameSnapshots, () => gameState.get(), listPlayersService.clientId,
  body => httpClient.postServer(`/gameserver/current/connection`, body))
gameState.subscribe(() => currentConnection.observe())
gameState.subscribe(() => gamePresence.observe())
const authIpcHandlers = new AuthIpcHandlers(ipcMain, httpClient, authSessions, overlayWindowController, undefined, userId => {
  loggedInUserId = userId
  const operationalUserId = maintenanceOperational(maintenanceMonitor.snapshot()) ? userId : null
  userActivity.update(operationalUserId)
  actionWorker.setUser(userId)
  gamePresence.update(operationalUserId)
  currentConnection.update(operationalUserId)
  commandHistory.setUser(userId)
  commandReporter.setUser(userId)
})
const appLinkInbox = new AppLinkInbox()
const appLinkWindowFocus = new AppLinkWindowFocus(appLinkInbox, () => overlayWindowController.show())
const initialProtocolUrl = findAppProtocolUrl(process.argv)
const initialPlayerLink = initialProtocolUrl ? appLinkWindowFocus.accept(initialProtocolUrl) : false
const initialAuthUrl = initialPlayerLink ? undefined : initialProtocolUrl
function acceptIncomingProtocolUrl(value: string): void {
  if (appLinkWindowFocus.accept(value)) return
  void authIpcHandlers.acceptProtocolUrl(value)
}
const appUpdateService = new AppUpdateService(productVersion, globalThis.fetch, url => shell.openExternal(url), () => authIpcHandlers.requireUpdate())
let runtimeAuth: MainAuthState = { authenticated: false, onboardingComplete: false }
let operational = false
authIpcHandlers.subscribe(state => {
  runtimeAuth = state
  return runtime.transition({ ...state, operational, consoleSetupReady: !consoleSetup.getState().commandsBlocked })
})
maintenanceMonitor.subscribe(state => {
  const next = maintenanceOperational(state)
  if (next === operational) return
  operational = next
  if (!next) httpClient.cancelGameActions()
  void antiAfkService.setMaintenancePaused(!next)
  userActivity.update(next ? loggedInUserId : null)
  gamePresence.update(next ? loggedInUserId : null)
  currentConnection.update(next ? loggedInUserId : null)
  void runtime.transition({ ...runtimeAuth, operational: next, consoleSetupReady: !consoleSetup.getState().commandsBlocked })
})
void antiAfkService.setMaintenancePaused(true)
httpClient.setServerMaintenanceHandler(() => { void maintenanceMonitor.refresh() })
httpClient.setServerUnauthorizedHandler(sessionInvalidationHandler(authIpcHandlers))
const ipcHandlerRegistry = new IpcHandlerRegistry({
	ipcMain,
	httpClient,
	overlayWindow: overlayWindowController,
	focusMonitor,
	appHealthService,
	listPlayersPoller,
	currentGameSnapshots,
  currentConnectionClientId: () => listPlayersService.clientId,
	sentinel: sentinelService,
	overlayActivity,
	requestIds,
	appSettings: appSettingsService,
	toastWindow: toastWindowController,
	auth: authIpcHandlers,
	appLinks: appLinkInbox,
	antiAfk: antiAfkService,
	notificationPollMs,
	appUpdates: appUpdateService,
	diagnosticLogs,
	consoleSetup,
	gameState,
	actionAccess,
  commandHistory,
  maintenance: maintenanceMonitor,
});
const quitGuard = new RuntimeQuitGuard(
	async () => {
		overlayInputFocus.stop()
		maintenanceMonitor.stop()
		userActivity.update(null)
		gamePresence.destroy()
		currentConnection.destroy()
		await debugTools.setEnabled(false).catch(error => console.error(`Debug shutdown failed.`, error))
		try {
			await runtime.shutdown()
		} finally {
			await coreProcessController?.stop()
			await consoleSetup.flushVerification().catch(error => console.error(`Console verification save failed.`, error))
			await diagnosticLogs.flush().catch(() => undefined)
		}
	},
	() => {
		antiAfkService.stop()
		focusMonitor.stop()
		gameState.stop()
		shortcutRegistry.unregisterAll()
		appTrayController.cleanup()
	},
	() => app.quit()
)
app.on('will-quit', event => quitGuard.handle(event));

registerAuthProtocol();

if (!hasSingleInstanceLock) {
	app.quit();
} else {
	app.on('second-instance', (_event, commandLine) => {
		const protocolUrl = findAppProtocolUrl(commandLine)
		if (protocolUrl) acceptIncomingProtocolUrl(protocolUrl)
		else appLinkWindowFocus.requestFocus()
	});

	app.on('open-url', (event, url) => {
		event.preventDefault();
		acceptIncomingProtocolUrl(url)
	});

	app.whenReady().then(async () => {
		if (app.isPackaged) {
			installRendererProtocol(protocol, url => net.fetch(url), resolve(__dirname, `../renderer`))
		}
		app.setAppUserModelId(appIdentity.appId)
		void startApplication({
			isPackaged: app.isPackaged,
			startCore: async () => {
				coreProcessController = new CoreProcessController({
					executablePath: resolveCoreExecutable(process.resourcesPath),
					expectedVersion: productVersion,
					reservePort: reserveLoopbackPort,
					randomBytes,
					spawn: (file, args, options) => spawn(file, [...args], options),
					fetch: globalThis.fetch,
					now: Date.now,
					delay: milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds)),
					onError: error => console.error(`Core shutdown failed.`, error)
				})
				return coreProcessController.start()
			},
			setCoreConnection: connection => httpClient.setCoreConnection(connection),
			initializeRuntime: async () => {
				await appSettingsService.load()
				maintenanceMonitor.restoreCached(appSettingsService.getMaintenanceSnapshot(httpClient.serverBaseUrl))
				maintenanceMonitor.start()
				await consoleSetup.loadVerification()
				await debugTools.initialize()
				appTrayController.refresh(appSettingsService.getSettings().overlayKey)
			},
			registerIpc: () => { ipcHandlerRegistry.register(); debugTools.register(ipcMain) },
			createWindow: () => {
				const window = overlayWindowController.getOrCreate()
				window.on(`blur`, () => setKeybindRecording(false))
				window.on(`hide`, () => setKeybindRecording(false))
				window.on(`closed`, () => setKeybindRecording(false))
				window.webContents.on(`did-start-loading`, () => setKeybindRecording(false))
				window.webContents.on(`did-finish-load`, () => overlayInputFocus.publish(overlayActivity.getTextInputActive(), true))
				window.webContents.on(`render-process-gone`, () => setKeybindRecording(false))
				sentinelBorderWindow.bindOverlay(window)
				debugWindow.bindOverlay(window)
				overlayWindowController.showWhenReady()
				appLinkWindowFocus.windowReady()
				void httpClient.callCore(`/v3/runtime/app`, {
					method: `POST`, body: JSON.stringify(coreRequestPayloads.appTarget())
				}).then(result => {
					if (result.ok) overlayInputFocus.publish(overlayActivity.getTextInputActive(), true)
				}).catch(error => console.error(`Core app registration failed.`, error))
			},
			beginAuthentication: () => {
				const initialization = initializeWindowBeforeAuth({
					registerIpc: () => undefined,
					checkUpdates: () => appUpdateService.check(),
					restoreSession: () => authIpcHandlers.restoreSession(),
					initialAuthUrl,
					acceptProtocolUrl: value => authIpcHandlers.acceptProtocolUrl(value),
					createWindow: () => undefined,
					handleSessionFailure: error => console.error('Startup authentication failed.', error)
				})
				authIpcHandlers.setStartupInitialization(initialization)
			},
			startMonitor: () => {
				try {
					shortcutRegistry.register(appSettingsService.getSettings())
				} catch (error) {
					console.warn(`Startup shortcut registration failed.`, error)
				}
				focusMonitor.start()
				gameState.start()
				void debugTools.setEnabled(appSettingsService.getSettings().debug).catch(error => console.error(`Debug startup failed.`, error))
			},
			startTray: () => appTrayController.initialize(),
			reportFatalError: (message, error) => {
				console.error(message, error)
				dialog.showErrorBox(`SpellBook startup failed`, message)
			}
		}).then(() => {
			app.on('activate', () => {
				overlayWindowController.getOrCreate()
			})
		}).catch(() => app.quit())
	});
}

function registerAuthProtocol(): void {
	if (process.defaultApp && process.argv[1]) {
		app.setAsDefaultProtocolClient(appIdentity.protocol, process.execPath, [resolve(process.argv[1])])
		return;
	}

	app.setAsDefaultProtocolClient(appIdentity.protocol)
}

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
