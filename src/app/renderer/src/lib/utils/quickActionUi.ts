import type { QuickActionMessageKind } from "./quickActions"

type ModalStateBoundary = (open: boolean) => Promise<void>
type OverlayVisibilitySubscriber = (
  callback: (visible: boolean) => void
) => () => void

export function nextQuickActionMessageKind(
  currentKind: QuickActionMessageKind | null,
  selectedKind: QuickActionMessageKind
): QuickActionMessageKind | null {
  return currentKind === selectedKind ? null : selectedKind
}

export function bindModalToOverlayVisibility(
  subscribe: OverlayVisibilitySubscriber,
  closeModal: () => void | Promise<void>
): () => void {
  return subscribe(visible => {
    if (!visible) void closeModal()
  })
}

const modalFocusableSelector = [
  `button:not([disabled]):not([tabindex="-1"])`,
  `textarea:not([disabled]):not([tabindex="-1"])`,
  `input:not([disabled]):not([tabindex="-1"])`,
  `select:not([disabled]):not([tabindex="-1"])`,
  `a[href]:not([tabindex="-1"])`,
  `[tabindex]:not([tabindex="-1"])`
].join(`,`)

export class ModalStateCoordinator {
  private desiredOpen = false
  private appliedOpen: boolean | null = null
  private queue = Promise.resolve()

  constructor(private readonly apply: ModalStateBoundary) {}

  set(open: boolean): Promise<void> {
    this.desiredOpen = open
    const task = this.queue.catch(() => undefined).then(() => this.sync())
    this.queue = task
    return task
  }

  private async sync(): Promise<void> {
    while (this.appliedOpen !== this.desiredOpen) {
      const nextOpen = this.desiredOpen
      await this.apply(nextOpen)
      this.appliedOpen = nextOpen
    }
  }
}

export function containModalTab(
  event: KeyboardEvent,
  focusRoot: HTMLElement | readonly HTMLElement[],
  activeElement: Element | null
): void {
  if (event.key !== `Tab`) return

  const roots = (
    Array.isArray(focusRoot) ? focusRoot : [focusRoot]
  ) as readonly HTMLElement[]
  const focusable = roots.flatMap(root =>
    Array.from(root.querySelectorAll<HTMLElement>(modalFocusableSelector))
  )
  const first = focusable.at(0)
  const last = focusable.at(-1)
  const target =
    !first || !last ? roots.at(-1)
    : event.shiftKey && activeElement === first ? last
    : !event.shiftKey && activeElement === last ? first
    : !focusable.includes(activeElement as HTMLElement) ? (event.shiftKey ? last : first)
    : null

  if (!target) return
  event.preventDefault()
  target.focus()
}

export function makeModalBackgroundInert(
  modalRoot: HTMLElement,
  persistentElements: readonly HTMLElement[] = []
): () => void {
  const previous = new Map<HTMLElement, boolean>()
  const persistent = new Set(persistentElements)
  let current = modalRoot

  while (current.parentElement) {
    const parent = current.parentElement
    for (const sibling of Array.from(parent.children)) {
      if (sibling === current || persistent.has(sibling as HTMLElement) || !(`inert` in sibling)) continue
      const element = sibling as HTMLElement
      previous.set(element, element.inert)
      element.inert = true
    }
    current = parent
  }

  return () => {
    for (const [element, inert] of previous) element.inert = inert
  }
}

export function mountModalEnvironment(
  modalRoot: HTMLElement,
  returnFocus: HTMLButtonElement | null,
  persistentElements: readonly HTMLElement[] = []
): () => void {
  const restoreBackground = makeModalBackgroundInert(modalRoot, persistentElements)

  return () => {
    restoreBackground()
    if (returnFocus?.isConnected) returnFocus.focus()
  }
}
