import type { Action } from 'svelte/action'
import type { PlayerPresence } from '@spellbook/shared/playerPresence.js'
import { formatPlayerPresenceTooltip } from './playerPresence'
import { fetchPlayerProfile } from './serverProfilesApi'
import { tooltip } from './tooltip'

type PresenceTooltipOptions = {
  playfabId?: string | null
  presence?: PlayerPresence | null
  viewer: object | null
}

export function createPlayerPresenceTooltip(
  load: (playfabId: string) => Promise<PlayerPresence | null>
): Action<HTMLElement, PresenceTooltipOptions> {
  return (node, initial) => {
    let options = initial
    let hovered = false
    let focused = false
    let revision = 0
    const text = () => options.viewer ? formatPlayerPresenceTooltip(options.presence) : ``
    const hint = tooltip(node, text())

    async function refresh() {
      const request = ++revision
      hint?.update?.(text())
      if (!(hovered || focused) || !options.viewer || !options.playfabId || options.presence !== undefined) return
      try {
        const presence = await load(options.playfabId)
        if (request === revision) hint?.update?.(formatPlayerPresenceTooltip(presence))
      } catch {
        if (request === revision) hint?.update?.(``)
      }
    }

    function enter(event: Event) {
      const engaged = hovered || focused
      if (event.type === `pointerenter`) hovered = true
      else {
        focused = true
        event.stopPropagation()
      }
      if (!engaged) void refresh()
    }

    function leave(event: Event) {
      if (event.type === `pointerleave`) hovered = false
      else focused = false
      if (!(hovered || focused)) {
        revision += 1
        hint?.update?.(text())
      }
    }

    node.addEventListener(`pointerenter`, enter)
    node.addEventListener(`focusin`, enter)
    node.addEventListener(`pointerleave`, leave)
    node.addEventListener(`focusout`, leave)
    return {
      update(next) {
        if (next.viewer === options.viewer && next.playfabId === options.playfabId && next.presence === options.presence) return
        options = next
        void refresh()
      },
      destroy() {
        revision += 1
        node.removeEventListener(`pointerenter`, enter)
        node.removeEventListener(`focusin`, enter)
        node.removeEventListener(`pointerleave`, leave)
        node.removeEventListener(`focusout`, leave)
        hint?.destroy?.()
      }
    }
  }
}

export const playerPresenceTooltip = createPlayerPresenceTooltip(async playfabId =>
  (await fetchPlayerProfile(playfabId)).presence ?? null
)
