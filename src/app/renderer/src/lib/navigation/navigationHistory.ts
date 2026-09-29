export type NavigationSnapshot = Record<string, { value: unknown, route: string }>
type Binding = { read: () => unknown, restore: (value: any, isCurrent: () => boolean) => void | Promise<void>, route: (value: any) => unknown }
type Action = () => unknown | Promise<unknown>

export function createNavigationHistory(options: {
  settle?: () => Promise<void>
  canLeave?: (from: NavigationSnapshot, to: NavigationSnapshot) => boolean | Promise<boolean>
  changed?: () => void
} = {}) {
  const bindings = new Map<string, Binding>()
  const pending = new Map<Binding, NavigationSnapshot>()
  let entries: NavigationSnapshot[] = [{}]
  let index = 0
  let depth = 0
  let revision = 0
  let restoring = false
  let moving = false
  const copy = <T>(value: T): T => structuredClone(value)
  const snapshot = (binding: Binding) => {
    const value = copy(binding.read())
    return { value, route: JSON.stringify(binding.route(value)) }
  }
  const capture = (): NavigationSnapshot => ({
    ...(restoring ? entries[index] : {}),
    ...Object.fromEntries(Array.from(bindings, ([name, binding]) => [name,
      pending.get(binding) === entries[index] ? entries[index][name] : snapshot(binding)])),
  })
  async function restoreBinding(name: string, binding: Binding, target: NavigationSnapshot) {
    pending.set(binding, target)
    try {
      await binding.restore(copy(target[name].value),
        () => restoring && entries[index] === target && bindings.get(name) === binding)
    } finally {
      if (pending.get(binding) === target) pending.delete(binding)
    }
  }
  const same = (left: NavigationSnapshot, right: NavigationSnapshot) => {
    const routes = (state: NavigationSnapshot) => Object.entries(state)
      .filter(([, part]) => part.route !== `null`)
      .map(([name, part]) => [name, part.route]).sort(([a], [b]) => a.localeCompare(b))
    return JSON.stringify(routes(left)) === JSON.stringify(routes(right))
  }
  const settle = async () => { await options.settle?.() }
  const changed = () => options.changed?.()

  async function move(direction: -1 | 1, fallback?: Action): Promise<boolean> {
    if (moving || depth) return false
    const next = index + direction
    if (next >= entries.length || (next < 0 && !fallback)) return false
    moving = true
    const version = revision
    const from = capture()
    try {
      if (next < 0) {
        depth += 1
        restoring = false
        try { await fallback?.() } finally { depth -= 1 }
        await settle()
        if (version !== revision) return false
        const parent = capture()
        if (same(from, parent)) return false
        entries[index] = from
        entries.unshift(parent)
        index = 0
      } else {
        const target = entries[next]
        if (options.canLeave && !await options.canLeave(from, target)) return false
        if (version !== revision) return false
        entries[index] = from
        index = next
        restoring = true
        for (const [name, binding] of Array.from(bindings)) {
          if (bindings.get(name) !== binding || !target[name]) continue
          await restoreBinding(name, binding, target)
          await settle()
          if (version !== revision) return false
        }
      }
      return true
    } finally {
      moving = false
      changed()
    }
  }

  const history = {
    get canBack() { return index > 0 },
    get canForward() { return index < entries.length - 1 },
    get busy() { return moving || depth > 0 },
    restored<T>(name: string): T | undefined { return restoring ? copy(entries[index][name]?.value as T) : undefined },
    register<T>(name: string, read: () => T, restore: (value: T, isCurrent: () => boolean) => void | Promise<void>, route: (value: T) => unknown = value => value) {
      const binding: Binding = { read, restore, route }
      bindings.set(name, binding)
      if (restoring && entries[index][name]) void restoreBinding(name, binding, entries[index])
      else if (!depth && !moving) entries[index][name] = snapshot(binding)
      return () => { if (bindings.get(name) === binding) bindings.delete(name) }
    },
    async visit(action: Action): Promise<boolean> {
      if (moving && depth === 0) return false
      if (depth) {
        await action()
        return true
      }
      const version = revision
      entries[index] = capture()
      restoring = false
      depth += 1
      try {
        const result = await action()
        await settle()
        if (version !== revision) return false
        const next = capture()
        if (!same(entries[index], next)) {
          entries = entries.slice(0, index + 1)
          entries.push(next)
          index += 1
        } else entries[index] = next
        return result !== false
      } finally {
        depth -= 1
        changed()
      }
    },
    back: (fallback?: Action) => move(-1, fallback),
    forward: () => move(1),
    reset() {
      revision += 1
      entries = [capture()]
      index = 0
      restoring = false
      changed()
    },
  }
  return history
}
