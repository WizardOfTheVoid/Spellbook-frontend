import { readonly, writable } from 'svelte/store'

const revision = writable(0)

export const gameServerRevision = readonly(revision)

export function gameServerChanged(): void {
  revision.update((value) => value + 1)
}
