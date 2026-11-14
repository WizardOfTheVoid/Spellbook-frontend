import { SimpleMarkdown, rules } from 'discord-markdown-parser'

export type PlayerNoteDisplayReference = { type: `reference`, kind: `action` | `user` | `player`, id: number }
export type PlayerNoteDisplaySegment =
  | { type: `text`, content: string }
  | { type: `inlineCode`, content: string }
  | { type: `codeBlock`, content: string }
  | PlayerNoteDisplayReference
  | { type: `br` }
  | { type: `heading`, level: number, content: PlayerNoteDisplaySegment[] }
  | { type: `list`, ordered: boolean, start?: number, items: PlayerNoteDisplaySegment[][] }
  | { type: `em` | `strong` | `underline` | `strikethrough` | `spoiler` | `paragraph` | `blockQuote` | `subtext`, content: PlayerNoteDisplaySegment[] }

const parser = SimpleMarkdown.parserFor({
  ...Object.fromEntries([
    `blockQuote`, `codeBlock`, `newline`, `escape`, `em`, `strong`, `underline`,
    `strikethrough`, `inlineCode`, `text`, `br`, `spoiler`,
  ].map(type => [type, rules[type]])),
  heading: lineStartRule(rules.heading),
  subtext: lineStartRule(rules.subtext),
  paragraph: SimpleMarkdown.defaultRules.paragraph,
  list: {
    ...SimpleMarkdown.defaultRules.list,
    match: (source, state, previous) => SimpleMarkdown.defaultRules.list.match(source, { ...state, inline: false }, previous),
  },
  reference: {
    order: rules.escape.order + 0.5,
    match: (source, state) => {
      const capture = /^(?:#\[action:([1-9]\d*)\]|@\[(user|player):([1-9]\d*)\])/u.exec(source)
      if (!capture || !Number.isSafeInteger(Number(capture[1] ?? capture[3]))) return null
      return capture[2] === `player` && !state.includePlayers ? null : capture
    },
    parse: capture => ({ kind: capture[1] ? `action` : capture[2], id: Number(capture[1] ?? capture[3]) }),
  },
})

function lineStartRule(rule: typeof rules[string]): typeof rules[string] {
  return {
    ...rule,
    match: (source, state, previous) => !previous || previous.endsWith(`\n`)
      ? rule.match(source, { ...state, prevCapture: null }, previous) : null,
  }
}

export function parsePlayerNoteDisplay(content: string, includePlayers = false): PlayerNoteDisplaySegment[] {
  const normalized = content.replace(/\r\n?/gu, `\n`).replace(/\n{4,}/gu, `\n\n\n`)
  return mergeText(parser(normalized, { inline: true, includePlayers }) as PlayerNoteDisplaySegment[])
}

function mergeText(nodes: PlayerNoteDisplaySegment[]): PlayerNoteDisplaySegment[] {
  const result: PlayerNoteDisplaySegment[] = []
  for (const node of nodes) {
    let next = node
    if (node.type === `list`) next = { ...node, items: node.items.map(mergeText) }
    else if (node.type !== `text` && node.type !== `inlineCode` && node.type !== `codeBlock` && `content` in node) {
      next = { ...node, content: mergeText(node.content) }
    }
    const previous = result.at(-1)
    if (next.type === `text`) {
      next.content = next.content.replace(/ {3,}/gu, `  `)
      if (previous?.type === `text`) { previous.content += next.content; continue }
    }
    result.push(next)
  }
  return result
}
