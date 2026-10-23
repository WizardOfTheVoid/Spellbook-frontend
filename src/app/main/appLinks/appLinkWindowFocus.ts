import { AppLinkInbox } from './appLinkInbox'

export class AppLinkWindowFocus {
  private ready = false

  constructor(private readonly inbox: AppLinkInbox, private readonly show: () => void) {}

  accept(value: string): boolean {
    if (!this.inbox.accept(value)) return false
    if (this.ready) this.show()
    return true
  }

  windowReady(): void {
    this.ready = true
  }
}
