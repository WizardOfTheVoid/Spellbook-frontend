type ReadOptions = {
  active: boolean
  read: boolean
  markRead: () => Promise<void>
}

export function observeNotificationRead(node: HTMLElement, options: ReadOptions) {
  let pending = false
  let marked = false
  let destroyed = false
  let hoverTimer: ReturnType<typeof setTimeout> | undefined

  function cancelHover() {
    clearTimeout(hoverTimer)
    hoverTimer = undefined
  }

  function startHover() {
    cancelHover()
    if (destroyed || !options.active || options.read || pending || marked) return
    hoverTimer = setTimeout(() => {
      hoverTimer = undefined
      void markRead()
    }, 3000)
  }

  async function markRead(): Promise<void> {
    if (destroyed || !options.active || options.read || pending || marked) return
    pending = true
    try {
      await options.markRead()
      marked = true
    } catch {
      // The inbox exposes the error; hovering again can retry.
    } finally {
      pending = false
    }
  }

  node.addEventListener(`mouseenter`, startHover)
  node.addEventListener(`mouseleave`, cancelHover)
  return {
    update(next: ReadOptions) {
      options = next
      if (!options.active || options.read) cancelHover()
    },
    destroy() {
      destroyed = true
      cancelHover()
      node.removeEventListener(`mouseenter`, startHover)
      node.removeEventListener(`mouseleave`, cancelHover)
    },
  }
}
