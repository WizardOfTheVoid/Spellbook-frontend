import type { ChildProcess, SpawnOptions } from 'node:child_process'
import type { CoreConnection } from './coreConnection'

type CoreProcessControllerOptions = {
  executablePath: string
  expectedVersion: string
  reservePort: () => Promise<number>
  randomBytes: (size: number) => Buffer
  spawn: (file: string, args: readonly string[], options: SpawnOptions) => ChildProcess
  fetch: typeof globalThis.fetch
  now: () => number
  delay: (milliseconds: number) => Promise<void>
  onError: (error: unknown) => void
}

type RuntimeIdentity = {
  version: string
  instanceId: string
  processId: number
}

const readinessTimeoutMs = 10_000
const readinessIntervalMs = 100
const shutdownTimeoutMs = 5_000

export class CoreProcessController {
  private child: ChildProcess | null = null
  private stopPromise: Promise<void> | null = null

  constructor(private readonly options: CoreProcessControllerOptions) {}

  async start(): Promise<CoreConnection> {
    if (this.child) throw new Error(`Packaged Core process is already started`)
    const port = await this.options.reservePort()
    const authToken = this.options.randomBytes(32).toString(`base64url`)
    const instanceId = this.options.randomBytes(16).toString(`base64url`)
    const baseUrl = `http://127.0.0.1:${port}`
    const child = this.options.spawn(this.options.executablePath, [], {
      env: {
        ...process.env,
        CORE__HOST: `127.0.0.1`,
        CORE__PORT: String(port),
        CORE__AUTHTOKEN: authToken,
        CORE__INSTANCEID: instanceId
      },
      shell: false,
      windowsHide: true,
      stdio: `ignore`
    })
    this.child = child

    try {
      await this.waitForReadiness(child, baseUrl, authToken, instanceId)
      return { baseUrl, authToken }
    } catch (error) {
      await this.stop()
      throw error
    }
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise
    const child = this.child
    if (!child) return Promise.resolve()
    this.stopPromise = this.stopChild(child).finally(() => {
      if (this.child === child) this.child = null
      this.stopPromise = null
    })
    return this.stopPromise
  }

  private async waitForReadiness(
    child: ChildProcess,
    baseUrl: string,
    authToken: string,
    instanceId: string
  ): Promise<void> {
    if (!child.pid) throw new Error(`Packaged Core did not provide a process ID`)
    const startedAt = this.options.now()
    let exited = false
    let rejectExit: (error: Error) => void = () => undefined
    const exitPromise = new Promise<never>((_, reject) => { rejectExit = reject })
    const onExit = (): void => {
      exited = true
      rejectExit(new Error(`Packaged Core exited before readiness`))
    }
    child.once(`exit`, onExit)

    try {
      while (this.options.now() - startedAt < readinessTimeoutMs) {
        if (exited) throw new Error(`Packaged Core exited before readiness`)
        let response: Response
        try {
          response = await this.options.fetch(`${baseUrl}/v2/runtime/ready`, {
            headers: { 'X-Chiv-Admin-Token': authToken }
          })
        } catch {
          await Promise.race([
            this.options.delay(readinessIntervalMs),
            exitPromise
          ])
          continue
        }

        if (!response.ok) {
          throw new Error(`Packaged Core readiness failed with HTTP ${response.status}`)
        }
        let identity: RuntimeIdentity | undefined
        try {
          const envelope = await response.json() as { data?: RuntimeIdentity }
          identity = envelope.data
        } catch {
          throw new Error(`Packaged Core readiness returned an invalid response`)
        }
        if (!identity || identity.version !== this.options.expectedVersion ||
            identity.instanceId !== instanceId || identity.processId !== child.pid) {
          throw new Error(`Packaged Core readiness identity did not match`)
        }
        return
      }
      throw new Error(`Packaged Core did not become ready within ${readinessTimeoutMs}ms`)
    } finally {
      child.off(`exit`, onExit)
    }
  }

  private async stopChild(child: ChildProcess): Promise<void> {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise<void>(resolve => child.once(`exit`, () => resolve()))
    child.kill(`SIGTERM`)
    if (child.exitCode !== null || child.signalCode !== null) return
    const forced = this.options.delay(shutdownTimeoutMs).then(() => `timeout` as const)
    if (await Promise.race([exited.then(() => `exited` as const), forced]) === `timeout`) {
      child.kill(`SIGKILL`)
      this.options.onError(new Error(`Packaged Core required forced termination`))
    }
  }
}