import { onDestroy, onMount, tick } from 'svelte'
import { writable } from 'svelte/store'
import { createNavigationHistory, type NavigationSnapshot } from './navigationHistory'
import { unsavedChanges } from '../utils/unsavedChanges'

export const navigationState = writable({ canBack: false, canForward: false })
const editorBoundary = (snapshot: NavigationSnapshot) => {
  const root = snapshot.app?.value as Record<string, unknown> | undefined
  const profile = snapshot.profileView?.value as { mode: string } | undefined
  return JSON.stringify(root && [root.activePage, root.selectedProfileId, root.selectedOwner,
    root.activePage === `profiles` ? profile?.mode : null])
}

export const navigation = createNavigationHistory({
  settle: tick,
  canLeave: (from, to) => editorBoundary(from) === editorBoundary(to) || unsavedChanges.canLeave(),
  changed: () => navigationState.set({ canBack: navigation.canBack, canForward: navigation.canForward }),
})

export function rememberNavigation<T>(
  name: string, read: () => T, restore: (value: T, isCurrent: () => boolean) => void | Promise<void>, route?: (value: T) => unknown,
) {
  if (name === `app`) onDestroy(navigation.register(name, read, restore, route))
  else onMount(() => navigation.register(name, read, restore, route))
}

export function navigationScroll(node: HTMLElement, name: string) {
  let observer: MutationObserver | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  const stop = navigation.register(`scroll:${name}`, () => node.scrollTop, top => {
    observer?.disconnect()
    clearTimeout(timeout)
    const restore = () => {
      node.scrollTop = top
      if (node.scrollTop === top) observer?.disconnect()
    }
    observer = new MutationObserver(restore)
    observer.observe(node, { childList: true, subtree: true })
    restore()
    timeout = setTimeout(() => observer?.disconnect(), 5000)
  }, () => null)
  return { destroy() {
    stop()
    observer?.disconnect()
    clearTimeout(timeout)
  } }
}

export function navigateBack() {
  if (document.querySelector(`[role="dialog"][aria-modal="true"]:not([data-navigation-help])`)) return
  const dialog = document.querySelector<HTMLElement>(`[data-navigation-help]`)
  const button = (dialog ?? document.querySelector(`.content-sidebar`))
    ?.querySelector<HTMLButtonElement>(`[data-navigation-back]`)
  if (button) button.click()
  else if (!dialog) void navigation.back()
}

export function navigateForward() {
  if (!document.querySelector(`[role="dialog"][aria-modal="true"]:not([data-navigation-help])`)) void navigation.forward()
}
