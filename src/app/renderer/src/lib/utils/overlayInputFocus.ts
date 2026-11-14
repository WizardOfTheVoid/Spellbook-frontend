import { hasFocusedEditableElement } from './dom'

export function observeOverlayInputFocus(document: Document, publish: (focused: boolean) => void): () => void {
  const view = document.defaultView
  let stopped = false
  let focused: boolean | undefined
  let selected: Element | null = null
  const report = (element = document.activeElement) => {
    if (stopped) return
    selected = element
    const next = hasFocusedEditableElement(element)
    if (next === focused) return
    focused = next
    publish(next)
  }
  const resync = () => report()
  const focusOut = (event: FocusEvent) => {
    const target = event.relatedTarget
    if (target && `closest` in target) report(target as Element)
    else queueMicrotask(resync)
  }
  const observer = view ? new view.MutationObserver(() => {
    if (focused && selected && !selected.isConnected) report()
  }) : null
  document.addEventListener(`focusin`, resync, true)
  document.addEventListener(`focusout`, focusOut, true)
  view?.addEventListener(`focus`, resync)
  observer?.observe(document, { childList: true, subtree: true })
  report()
  return () => {
    stopped = true
    document.removeEventListener(`focusin`, resync, true)
    document.removeEventListener(`focusout`, focusOut, true)
    view?.removeEventListener(`focus`, resync)
    observer?.disconnect()
  }
}
