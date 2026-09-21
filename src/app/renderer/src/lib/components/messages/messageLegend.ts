import { tagDefinitionRows, type TagTypeDefinition } from '@spellbook/shared/actions/tagTypeDefinitions.js'
import { resolveMessageTemplate, type MessageTagContext, type MessageTagItem } from '$lib/utils/messageTags'

const playerTags = new Set([`user`, `duration`, `playfab`, `offenses`, `offense_type`, `action_type`])
const mockContext = {
  user: `Samwise`, duration: `24`, admin: `Example admin`, playfab: `PLAYER_1`, offenses: `3`,
  serverName: `Example server`, clanName: `Example team`, clanTag: `TEAM`, offenseType: `verbal_abuse`, actionType: `ban`
}

export function messageLegendItems(definitions: readonly TagTypeDefinition[], context: MessageTagContext,
  options: { player: boolean, authoring: boolean }): MessageTagItem[] {
  const examples = { ...context }
  for (const key of Object.keys(mockContext) as (keyof typeof mockContext)[]) {
    if (!examples[key]?.trim()) examples[key] = mockContext[key]
  }
  return tagDefinitionRows(definitions).filter(row => row.group === `tag` && (options.player || !playerTags.has(row.slug)))
    .flatMap(row => {
      const variants = [{ tag: `[${row.slug}]`, name: row.name },
        ...(row.alt ? [{ tag: `[${row.slug}_alt]`, name: `${row.name} alternative` }] : []),
        ...(row.pastTense ? [{ tag: `[${row.slug}_pt]`, name: `${row.name} past tense` }] : [])]
      return variants.map(item => {
        const example = resolveMessageTemplate(item.tag, { ...examples, tagDefinitions: definitions })
        const value = resolveMessageTemplate(item.tag, { ...context, tagDefinitions: definitions })
        return { ...item, group: playerTags.has(row.slug) ? `Player & action` : `Server & admin`, example,
          disabled: !options.authoring && !value.trim(), tooltip: example }
      })
    })
}
