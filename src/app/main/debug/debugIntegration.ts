import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { HttpClient } from '../api/http-client'
import type { CoreAppTarget } from '../../shared/coreAction'
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import type { DebugProducer, DebugSessionSnapshot } from '../../shared/debug'
import type { DebugWindowController } from '../window/debugWindowController'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { readActivity } from '../services/gameActivitySnapshot'
import { DebugSession } from './debugSession'
import { DebugIpc } from './debugIpc'
import { AppCpuUsage } from './appCpuUsage'

type Dependencies = {
  http: Pick<HttpClient, `callCore`>
  appTarget: () => CoreAppTarget
  getConsoleKey: () => ConsoleKeyCode | null
  getAppMetrics: () => Electron.ProcessMetric[]
  overlay: OverlayWindowController
  display: DebugWindowController
  producers: Record<DebugProducer, { setDebugPaused(paused: boolean): Promise<void> }>
  configPath: string
  intervalMs: number
  eventLimit: number
  runLimit: number
  minimumIdleMs: number
  selectDestination: () => Promise<string | null>
}

export function createDebugTools(options: Dependencies) {
  const cpuUsage = new AppCpuUsage(options.getAppMetrics)
  let displayed = false
  let exporting = false
  const publish = (state: DebugSessionSnapshot): void => {
    if (displayed !== state.enabled) {
      displayed = state.enabled
      options.display.setEnabled(displayed)
    }
    options.display.updateSession(state)
    const activity = readActivity({ ok: true, status: 200, statusText: `OK`,
      data: { ok: true, data: state.core?.status } }, options.minimumIdleMs)
    options.display.update(activity)
    options.overlay.sendToCurrent(`debug:state`, state)
    options.overlay.sendToCurrent(`debug:activity`, activity)
  }
  const session = new DebugSession({
    http: options.http, appTarget: options.appTarget, getConsoleKey: options.getConsoleKey,
    getAppCpuPercent: () => cpuUsage.read(),
    setProducerPaused: (producer, paused) => options.producers[producer].setDebugPaused(paused),
    publish, pollIntervalMs: options.intervalMs, eventLimit: options.eventLimit, runLimit: options.runLimit,
    loadConfig: async () => {
      try { return JSON.parse(await readFile(options.configPath, `utf8`)) }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === `ENOENT`) return null
        throw error
      }
    },
    saveConfig: async config => {
      await mkdir(dirname(options.configPath), { recursive: true })
      const temporary = `${options.configPath}.tmp`
      await writeFile(temporary, JSON.stringify(config, null, 2), `utf8`)
      await rename(temporary, options.configPath)
    }
  })
  const allowed = (event: IpcMainInvokeEvent, write: boolean): boolean =>
    !!event.senderFrame && event.senderFrame === event.sender.mainFrame &&
    (event.sender === options.overlay.getCurrent()?.webContents ||
      (!write && event.sender === options.display.getCurrent()?.webContents))

  return {
    initialize: () => session.initialize(),
    setEnabled: (enabled: boolean) => session.setEnabled(enabled),
    toggleHud: () => session.toggleHud(),
    register: (ipc: Pick<IpcMain, `handle`>) => {
      const controls = {
        getState: () => session.getState(),
        setArmed: (armed: boolean) => session.setArmed(armed),
        run: (slot: number) => session.run(slot),
        stop: () => session.stop(),
        savePreset: session.savePreset.bind(session), resetPresets: () => session.resetPresets(),
        preview: session.preview.bind(session), queue: session.queue.bind(session),
        setProducerPaused: session.setProducerPaused.bind(session), configure: session.configure.bind(session),
        settings: session.settings.bind(session), record: session.record.bind(session), mark: session.mark.bind(session),
        exportRecording: async (): Promise<string | null> => {
          if (exporting) return null
          exporting = true
          try {
            const content = await session.exportRecording()
            const path = await options.selectDestination()
            if (path) await writeFile(path, content, `utf8`)
            return path
          } finally { exporting = false }
        }
      }
      new DebugIpc(ipc, controls, allowed).register()
    }
  }
}
