import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { DebugControlApi, DebugLayout, DebugPreset, DebugProducer, DebugQueueOperation } from '../../shared/debug'

type Controls = Omit<DebugControlApi, `onState`>

export class DebugIpc {
  constructor(
    private readonly ipc: Pick<IpcMain, `handle`>,
    private readonly controls: Controls,
    private readonly allowed: (event: IpcMainInvokeEvent, write: boolean) => boolean
  ) {}

  register(): void {
    this.ipc.handle(`debug:get-state`, async event => {
      this.verify(event, false)
      return this.controls.getState()
    })
    this.ipc.handle(`debug:control`, async (event, operation: unknown, args: unknown) => {
      this.verify(event, true)
      if (!Array.isArray(args) || args.length > 3) throw new Error(`Invalid Debug arguments.`)
      const [value, second, third] = args
      switch (operation) {
        case `run`:
          if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 4) throw new Error(`Invalid Debug slot.`)
          return this.controls.run(value as number)
        case `setArmed`: return this.controls.setArmed(boolean(value))
        case `record`: return this.controls.record(boolean(value))
        case `stop`: return this.controls.stop()
        case `resetPresets`: return this.controls.resetPresets()
        case `savePreset`: return this.controls.savePreset(record(value) as DebugPreset)
        case `preview`: return this.controls.preview(record(value) as DebugPreset)
        case `configure`: return this.controls.configure(record(value) as DebugLayout)
        case `setProducerPaused`:
          if (![`listPlayers`, `wanted`, `antiAfk`].includes(value as string)) throw new Error(`Invalid Debug producer.`)
          return this.controls.setProducerPaused(value as DebugProducer, boolean(second))
        case `queue`:
          if (![`pause`, `resume`, `step`, `cancel`, `stop`].includes(value as string)) throw new Error(`Invalid queue operation.`)
          if (second !== undefined && (typeof second !== `string` || second.length > 256)) throw new Error(`Invalid Action ID.`)
          return this.controls.queue(value as DebugQueueOperation, second)
        case `settings`:
          if (!Object.values(record(value)).every(item => typeof item === `number` && Number.isFinite(item))) throw new Error(`Invalid Debug settings.`)
          return this.controls.settings(value as Record<string, number>, second === undefined ? false : boolean(second), third === undefined ? false : boolean(third))
        case `mark`:
          if (typeof value !== `string` || value.length > 200) throw new Error(`Invalid recording marker.`)
          return this.controls.mark(value)
        case `exportRecording`: return this.controls.exportRecording()
        default: throw new Error(`Unknown Debug operation.`)
      }
    })
  }

  private verify(event: IpcMainInvokeEvent, write: boolean): void {
    if (!this.allowed(event, write)) throw new Error(`Invalid Debug sender.`)
  }
}

function boolean(value: unknown): boolean {
  if (typeof value !== `boolean`) throw new Error(`Expected a boolean.`)
  return value
}

function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== `object` || Array.isArray(value)) throw new Error(`Expected an object.`)
  return value as Record<string, any>
}
