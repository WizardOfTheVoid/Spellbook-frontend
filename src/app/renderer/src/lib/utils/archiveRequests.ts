export function createQueryDebouncer<T>(apply: (value: T) => void, delayMs = 320) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  return {
    schedule(value: T): void {
      cancel()
      timer = setTimeout(() => {
        timer = null
        apply(value)
      }, delayMs)
    },
    cancel
  }
}

export function createLatestRequestTracker(onPendingChange: (pending: boolean) => void) {
  let version = 0
  let pending = false
  const setPending = (next: boolean) => {
    if (next === pending) return
    pending = next
    onPendingChange(next)
  }

  return {
    start(): number {
      version += 1
      setPending(true)
      return version
    },
    isCurrent: (candidate: number): boolean => candidate === version,
    settle(candidate: number): void {
      if (candidate === version) setPending(false)
    },
    cancel(): void {
      version += 1
      setPending(false)
    }
  }
}

