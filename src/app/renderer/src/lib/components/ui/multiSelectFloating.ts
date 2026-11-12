import { datePickerOverlayPosition } from './datePickerValues'

export function floatMultiSelect(node: HTMLDivElement, enabled: boolean) {
  if (!enabled) return
  const trigger = node.closest(`.ui-multi-select`)?.querySelector<HTMLElement>(`[role="combobox"]`)
  if (!trigger) return
  node.showPopover()
  const position = () => {
    const bounds = trigger.getBoundingClientRect()
    node.style.width = `${bounds.width}px`
    const point = datePickerOverlayPosition(bounds, { width: node.offsetWidth, height: node.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight })
    node.style.left = `${point.x}px`
    node.style.top = `${point.y}px`
  }
  position()
  const observer = new ResizeObserver(position)
  observer.observe(node)
  window.addEventListener(`resize`, position)
  window.addEventListener(`scroll`, position, true)
  return { destroy() {
    observer.disconnect()
    window.removeEventListener(`resize`, position)
    window.removeEventListener(`scroll`, position, true)
    if (node.matches(`:popover-open`)) node.hidePopover()
  } }
}
