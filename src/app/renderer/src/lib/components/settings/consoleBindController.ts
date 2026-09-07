import type { ConsoleKeyCode } from '../../../../../shared/consoleKey'

export type ConsoleBindRetry = `load` | `save` | null

export type ConsoleBindState = Readonly<{
  busy: boolean
  loading: boolean
  recording: boolean
  saving: boolean
  message: string
  retry: ConsoleBindRetry
}>

type ConsoleBindDependencies = {
  load: () => Promise<boolean>
  save: (consoleKey: ConsoleKeyCode | null) => Promise<boolean>
}

const initialState: ConsoleBindState = {
  busy: false,
  loading: false,
  recording: false,
  saving: false,
  message: ``,
  retry: null
}

export class ConsoleBindController {
  state = initialState

  private active = true
  private pendingKey: ConsoleKeyCode | null | undefined
  private revision = 0

  constructor(
    private readonly dependencies: ConsoleBindDependencies,
    private readonly onChange: (state: ConsoleBindState) => void = () => undefined
  ) {}

  async load(): Promise<void> {
    if (!this.active || this.state.loading || this.state.saving) return
    const request = ++this.revision
    this.pendingKey = undefined
    this.setState({ ...initialState, busy: true, loading: true })
    const loaded = await this.dependencies.load()
    if (!this.isCurrent(request)) return
    this.setState({
      ...initialState,
      message: loaded ? `` : `Could not load the console key. Try again.`,
      retry: loaded ? null : `load`
    })
  }

  startRecording(): void {
    if (!this.active || this.state.loading || this.state.saving) return
    this.pendingKey = undefined
    this.setState({
      ...this.state,
      busy: true,
      recording: true,
      message: ``,
      retry: null
    })
  }

  cancelRecording(clearMessage = false): void {
    if (!this.active || !this.state.recording) return
    this.setState({
      ...this.state,
      busy: false,
      recording: false,
      message: clearMessage ? `` : this.state.message
    })
  }

  rejectKey(): void {
    if (!this.active || !this.state.recording) return
    this.setState({
      ...this.state,
      message: `Use one key without modifiers. Enter, Escape, F3, F4 and F12 are reserved.`
    })
  }

  async save(consoleKey: ConsoleKeyCode | null): Promise<void> {
    if (!this.active || this.state.loading || this.state.saving) return
    const request = ++this.revision
    this.pendingKey = consoleKey
    this.setState({ ...initialState, busy: true, saving: true })
    const saved = await this.dependencies.save(consoleKey)
    if (!this.isCurrent(request)) return
    if (saved) this.pendingKey = undefined
    this.setState({
      ...initialState,
      message: saved ? `Console key saved on this computer.` : `Could not save the console key. Try again.`,
      retry: saved ? null : `save`
    })
  }

  async retry(): Promise<void> {
    if (this.state.retry === `load`) {
      await this.load()
      return
    }
    if (this.state.retry === `save` && this.pendingKey !== undefined) await this.save(this.pendingKey)
  }

  destroy(): void {
    if (!this.active) return
    this.pendingKey = undefined
    this.setState(initialState)
    this.active = false
    this.revision += 1
  }

  private isCurrent(request: number): boolean {
    return this.active && request === this.revision
  }

  private setState(state: ConsoleBindState): void {
    this.state = state
    this.onChange(state)
  }
}
