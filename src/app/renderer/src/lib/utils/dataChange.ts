import { cssDuration } from './cssDuration'

export function dataChange(node: HTMLElement, value: unknown) {
  let previous = JSON.stringify(value)
  let animation: Animation | undefined
  return {
    update(next: unknown) {
      const key = JSON.stringify(next)
      if (key === previous) return
      previous = key
      animation?.cancel()
      const view = node.ownerDocument.defaultView
      if (!view || next === undefined || view.matchMedia(`(prefers-reduced-motion: reduce)`).matches) return
      const style = view.getComputedStyle(node)
      animation = node.animate([
        { color: style.getPropertyValue(`--color-update`).trim() },
        { color: style.color },
      ], { duration: cssDuration(style, `--motion-slow`), easing: style.getPropertyValue(`--easing`).trim() || `ease-out` })
    },
    destroy: () => animation?.cancel(),
  }
}
