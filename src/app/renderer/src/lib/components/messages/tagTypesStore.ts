import { get, writable } from 'svelte/store'
import { defaultTagDefinitions, type TagTypeDefinition } from '@spellbook/shared/actions/tagTypeDefinitions.js'
import { getServerApi } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'

export function createTagTypesStore(read: () => Promise<TagTypeDefinition[]>, write: (row: TagTypeDefinition) => Promise<TagTypeDefinition>) {
  const state = writable<readonly TagTypeDefinition[]>(defaultTagDefinitions)
  let pending: Promise<readonly TagTypeDefinition[]> | null = null
  let generation = 0
  async function refresh() {
    const version = generation
    const rows = await read()
    if (version === generation) state.set(rows)
    return get(state)
  }
  return {
    subscribe: state.subscribe,
    async load() {
      if (pending) return pending
      pending = refresh()
      try { return await pending } finally { pending = null }
    },
    async save(row: TagTypeDefinition) {
      const saved = await write(row)
      generation += 1
      state.update(rows => rows.map(item => item.group === saved.group && item.slug === saved.slug ? saved : item))
      return saved
    }
  }
}

export const tagTypes = createTagTypesStore(
  async () => unwrap<TagTypeDefinition[]>(await getServerApi().actions(`tagTypes`), `Could not load tag definitions.`),
  async row => unwrap<TagTypeDefinition>(await getServerApi().actions(`saveTagType`, row), `Could not save tag definition.`)
)
