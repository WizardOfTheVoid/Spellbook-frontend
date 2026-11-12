import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { TelemetryClient } from './telemetryClient'
import type { WorkerStatus } from '../../shared/telemetry/telemetryTypes'
type WorkerReady = {
  instanceId?: string
  processId?: number
  protocolVersion?: number
  version?: string
  address?: string
}

export class TelemetryProcessController {
  private child: ChildProcess | null = null
  private client: TelemetryClient | null = null
  private startup: Promise<TelemetryClient> | null = null
  private lifetime = new AbortController()
  constructor(
    private readonly executable: string,
    private readonly root: string,
    private readonly version: string
  ) {}

  async start(): Promise<TelemetryClient> {
    if (this.client && this.child?.exitCode === null && !this.lifetime.signal.aborted)
      return this.client
    this.startup ??= this.launch()
    try {
      return await this.startup
    } finally {
      this.startup = null
    }
  }
  private async launch(): Promise<TelemetryClient> {
    try {
      await access(this.executable)
    } catch {
      throw new Error(`Telemetry worker is missing. Run npm run telemetry:publish in frontend.`)
    }
    const token = randomBytes(32).toString(`hex`)
    const instance = randomUUID()
    this.lifetime = new AbortController()
    const signal = this.lifetime.signal
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        [
          `PATH`,
          `SYSTEMROOT`,
          `WINDIR`,
          `USERPROFILE`,
          `TEMP`,
          `TMP`,
          `LOCALAPPDATA`,
          `APPDATA`,
          `PROGRAMDATA`,
          `PROGRAMFILES`,
          `PROGRAMFILES(X86)`,
          `COMSPEC`,
          `PROCESSOR_ARCHITECTURE`
        ].includes(key.toUpperCase())
      )
    )
    const child = spawn(this.executable, [], {
      windowsHide: true,
      shell: false,
      stdio: [`ignore`, `pipe`, `ignore`],
      env: {
        ...environment,
        TELEMETRY_ROOT: this.root,
        TELEMETRY_TOKEN: token,
        TELEMETRY_INSTANCE: instance,
        TELEMETRY_PARENT_PID: String(process.pid),
        TELEMETRY_VERSION: this.version
      }
    })
    this.child = child
    let buffer = ``
    let ready: WorkerReady | null = null
    let failure: Error | undefined
    child.once(`error`, (error) => {
      failure = error
    })
    child.once(`exit`, () => {
      if (this.child === child) {
        this.client = null
        this.lifetime.abort()
      }
    })
    const data = (chunk: Buffer) => {
      buffer += chunk.toString(`utf8`)
      if (buffer.length > 32768) {
        failure = new Error(`Invalid worker readiness output`)
        return
      }
      const newline = buffer.indexOf(`\n`)
      if (newline >= 0 && !ready)
        try {
          ready = JSON.parse(buffer.slice(0, newline))
        } catch {
          failure = new Error(`Invalid worker readiness output`)
        }
    }
    child.stdout?.on(`data`, data)
    try {
      const deadline = Date.now() + 15000
      while (!ready && Date.now() < deadline) {
        if (failure) throw failure
        if (child.exitCode !== null || signal.aborted)
          throw new Error(`Telemetry worker exited during startup`)
        await delay(40, undefined, { signal })
      }
      const identity = ready as WorkerReady | null
      if (
        !identity ||
        identity.instanceId !== instance ||
        identity.processId !== child.pid ||
        identity.protocolVersion !== 1 ||
        identity.version !== this.version ||
        !/^http:\/\/127\.0\.0\.1:\d+$/.test(identity.address ?? ``)
      )
        throw new Error(`Telemetry readiness identity mismatch`)
      const client = new TelemetryClient(identity.address!, token, signal)
      const status = await client.call<WorkerStatus>(`/status`)
      if (
        status.instanceId !== instance ||
        status.processId !== child.pid ||
        status.version !== this.version ||
        status.protocolVersion !== 1
      )
        throw new Error(`Telemetry worker verification failed`)
      signal.throwIfAborted()
      this.client = client
      return client
    } catch (error) {
      await this.stop()
      throw error
    } finally {
      child.stdout?.off(`data`, data)
    }
  }
  async stop(): Promise<void> {
    const child = this.child
    this.lifetime.abort()
    this.child = null
    this.client = null
    if (!child || child.exitCode !== null) return
    child.kill(`SIGTERM`)
    const deadline = Date.now() + 9000
    while (child.exitCode === null && Date.now() < deadline) await delay(50)
    if (child.exitCode === null) child.kill(`SIGKILL`)
  }
}
