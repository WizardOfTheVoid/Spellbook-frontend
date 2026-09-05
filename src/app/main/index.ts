import { app, dialog, ipcMain, Menu, net, protocol, shell, Tray } from 'electron'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path';
import { CoreRequestPayloadFactory } from './api/core-request-payload-factory'
import { HttpClient } from './api/http-client';
import { antiAfkConfig, coreAuthToken, coreBaseUrl, focusMonitorMs, gameActivityConfig, notificationPollMs, resolveServerBaseUrl, serverAuthToken, wantedRuntimeConfig } from './config';
import { FocusMonitor } from './focus/focus-monitor';
import { FocusStateFactory } from './focus/focus-state-factory';
import { FocusStateLogger } from './focus/focus-state-logger';
import { AppHealthService } from './health/app-health-service';
import { IpcHandlerRegistry } from './ipc/ipc-handler-registry';
import { RequestIdFactory } from './request-id-factory';
import { AppSettingsService } from './services/app-settings-service';
import { ListPlayersService } from './services/list-players-service';
import { OverlayActivityGuard } from './services/overlay-activity-guard';
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
import { ListPlayersPoller } from './services/listPlayersPoller'
import { MainRuntimeCoordinator } from './services/mainRuntimeCoordinator'
import { RuntimeQuitGuard } from './services/runtimeQuitGuard'
import { initializeWindowBeforeAuth, sessionInvalidationHandler } from './services/mainRuntimeWiring'
import { SentinelService } from './services/sentinelService'
import { SentinelBorderWindowController } from './window/sentinelBorderWindowController'
import { SentinelBorderWindowFactory } from './window/sentinelBorderWindowFactory'
import { WantedCoreExecutor } from './services/wantedCoreExecutor'
import { WantedMessageResolver } from './services/wantedMessageResolver'
import { WantedWorker } from './services/wantedWorker'
import { WantedWorkClient } from './services/wantedWorkClient'
import { GameCommandEligibility } from './services/gameCommandEligibility'
import { appIdentity } from '@spellbook/shared/appIdentity'
import { findAppProtocolUrl } from './appProtocol'
import { resolveAppIconPath } from './window/appIconPath'
import { AppTrayController } from './window/appTrayController'
import { productVersion } from '@spellbook/shared/productVersion'
import { CoreProcessController } from './core/coreProcessController'
import { reserveLoopbackPort } from './core/corePort'
import { resolveCoreExecutable } from './core/coreRuntimePath'
import { startApplication } from './services/applicationStartup'
import { AppUpdateService } from './services/appUpdateService'
import { installRendererProtocol, registerRendererScheme } from './window/rendererRoute'


registerRendererScheme(protocol)
app.setName(appIdentity.name)
const hasSingleInstanceLock = app.requestSingleInstanceLock();
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
const appTrayController = new AppTrayController({
	appName: appIdentity.name,
	iconPath: appIconPath,
	getVersion: () => app.getVersion(),
	createTray: iconPath => new Tray(iconPath),
	buildMenu: template => Menu.buildFromTemplate(template),
	onToggle: () => overlayWindowController.toggle(),
	onExit: () => app.quit(),
	onError: error => console.error(`Tray setup failed.`, error)
})
const coreRequestPayloads = new CoreRequestPayloadFactory(() => overlayWindowController.getOrCreate())
const httpClient = new HttpClient({
	coreBaseUrl,
	coreAuthToken,
	serverBaseUrl: resolveServerBaseUrl(app.isPackaged, process.resourcesPath),
	serverAuthToken
}, coreRequestPayloads)
const shortcutRegistry = new ShortcutRegistry(overlayWindowController, () => void snapshotLookupService.run());
const focusStateFactory = new FocusStateFactory(overlayWindowController);
const focusStateLogger = new FocusStateLogger();
const overlayActivity = new OverlayActivityGuard(overlayWindowController);
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
const listPlayersService = new ListPlayersService(httpClient, requestIds, overlayActivity);
const currentGameSnapshots = new CurrentGameSnapshotStore()
const sentinelService = new SentinelService(antiAfkService)
const sentinelBorderWindow = new SentinelBorderWindowController(
	new SentinelBorderWindowFactory(__dirname, () => appSettingsService.getSelectedDisplay())
)
sentinelService.subscribe(({ enabled }) => sentinelBorderWindow.setEnabled(enabled))
const gameCommandEligibility = new GameCommandEligibility(overlayWindowController, httpClient)
const listPlayersPoller = new ListPlayersPoller(
	listPlayersService,
	currentGameSnapshots,
	sentinelService,
	wantedRuntimeConfig,
	gameCommandEligibility,
	gameActivityConfig
)
const wantedWorker = new WantedWorker({
	client: new WantedWorkClient(httpClient),
	resolver: new WantedMessageResolver(wantedRuntimeConfig),
	executor: new WantedCoreExecutor(httpClient, requestIds, overlayActivity),
	snapshots: currentGameSnapshots,
	listPlayers: listPlayersPoller,
	sentinel: sentinelService,
	eligibility: gameCommandEligibility,
	overlayActivity,
	cadence: wantedRuntimeConfig,
	activity: gameActivityConfig
})
const runtime = new MainRuntimeCoordinator([listPlayersPoller, wantedWorker], currentGameSnapshots)
let coreProcessController: CoreProcessController | null = null
const toastWindowController = new ToastWindowController(new ToastWindowFactory(__dirname, () => appSettingsService.getSelectedDisplay()));
const snapshotLookupService = new SnapshotLookupService(httpClient, overlayWindowController, requestIds);
const authSessions = new AuthSessionStore()
const appUpdateService = new AppUpdateService(productVersion, globalThis.fetch, url => shell.openExternal(url))
const authIpcHandlers = new AuthIpcHandlers(ipcMain, httpClient, authSessions, overlayWindowController);
authIpcHandlers.subscribe(state => runtime.transition(state))
httpClient.setServerUnauthorizedHandler(sessionInvalidationHandler(authIpcHandlers))
const ipcHandlerRegistry = new IpcHandlerRegistry({
	ipcMain,
	httpClient,
	overlayWindow: overlayWindowController,
	focusMonitor,
	appHealthService,
	listPlayersPoller,
	currentGameSnapshots,
	sentinel: sentinelService,
	overlayActivity,
	requestIds,
	appSettings: appSettingsService,
	toastWindow: toastWindowController,
	auth: authIpcHandlers,
	antiAfk: antiAfkService,
	notificationPollMs,
	appUpdates: appUpdateService,
});
const quitGuard = new RuntimeQuitGuard(
	async () => {
		try {
			await runtime.shutdown()
		} finally {
			await coreProcessController?.stop()
		}
	},
	() => {
		antiAfkService.stop()
		focusMonitor.stop()
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
		if (protocolUrl) void authIpcHandlers.acceptProtocolUrl(protocolUrl);
		else overlayWindowController.show();
	});

	app.on('open-url', (event, url) => {
		event.preventDefault();
		void authIpcHandlers.acceptProtocolUrl(url);
	});

	app.whenReady().then(() => {
		if (app.isPackaged) {
			installRendererProtocol(protocol, url => net.fetch(url), resolve(__dirname, `../renderer`))
		}
		app.setAppUserModelId(appIdentity.appId)
		const initialAuthUrl = findAppProtocolUrl(process.argv)
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
			registerIpc: () => ipcHandlerRegistry.register(),
			createWindow: () => {
				sentinelBorderWindow.bindOverlay(overlayWindowController.getOrCreate())
				overlayWindowController.showWhenReady()
			},
			beginAuthentication: () => {
				void initializeWindowBeforeAuth({
					registerIpc: () => undefined,
					restoreSession: () => authIpcHandlers.restoreSession(),
					initialAuthUrl,
					acceptProtocolUrl: value => authIpcHandlers.acceptProtocolUrl(value),
					createWindow: () => undefined,
					handleSessionFailure: error => console.error('Startup authentication failed.', error)
				})
				void appSettingsService.load()
					.then(() => overlayWindowController.moveToSelectedDisplay())
					.catch(error => console.warn('Startup settings load failed.', error))
			},
			startMonitor: () => {
				shortcutRegistry.register()
				focusMonitor.start()
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
