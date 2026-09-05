import { writable } from 'svelte/store'

export type UnsavedChangesPrompt = {
  returnFocus: HTMLButtonElement | null
  respond: (discard: boolean) => void
}

export const unsavedChangesPrompt = writable<UnsavedChangesPrompt | null>(null)

export function createUnsavedChangesGuard(confirmDiscard: () => Promise<boolean>) {
  const checks = new Set<() => boolean>()
  let confirming = false
  return {
    register(check: () => boolean): () => void {
      checks.add(check)
      return () => { checks.delete(check) }
    },
    async canLeave(): Promise<boolean> {
      if (confirming) return false
      const dirty = Array.from(checks).filter(check => check())
      if (dirty.length === 0) return true
      confirming = true
      try {
        return await confirmDiscard() && dirty.every(check => checks.has(check))
      } finally {
        confirming = false
      }
    },
  }
}

export const unsavedChanges = createUnsavedChangesGuard(() => new Promise<boolean>(resolve => {
  let settled = false
  unsavedChangesPrompt.set({
    returnFocus: document.activeElement instanceof HTMLButtonElement ? document.activeElement : null,
    respond(discard) {
      if (settled) return
      settled = true
      unsavedChangesPrompt.set(null)
      resolve(discard)
    },
  })
}))
