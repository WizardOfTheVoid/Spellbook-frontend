import { Extension, mergeAttributes, Node, type JSONContent } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion'
import type { PlayerAction, PlayerNoteUserReference } from '$lib/core'
import { parsePlayerNoteContent } from '@spellbook/shared/playerNotes.js'
import { actionLabel, formatActionTooltip } from './playerActions'

export type PlayerNoteEditorLabels = {
  actions: readonly PlayerAction[]
  users: readonly PlayerNoteUserReference[]
}

export type PlayerNoteSuggestion = {
  kind: `action` | `user`
  id: number
  label: string
  detail: string
  playerId?: number
}

export type ReferenceRange = { from: number, to: number, type: `actionReference` | `userReference` }

export const createPlayerNoteDocument = (
  content: string,
  labels: PlayerNoteEditorLabels,
): JSONContent => {
  const actions = new Map(labels.actions.map(action => [action.id, action]))
  const users = new Map(labels.users.map(user => [user.id, user]))
  const nodes: JSONContent[] = parsePlayerNoteContent(content).map(segment => {
    if (segment.type === `text`) return { type: `text`, text: segment.text }
    if (segment.kind === `action`) {
      const action = actions.get(segment.id)
      return {
        type: `actionReference`,
        attrs: {
          id: segment.id,
          label: action ? actionLabel(action) : `Action ${segment.id}`,
          playerId: action?.playerId ?? null,
          detail: action ? formatActionTooltip(action) : `Recorded action #${segment.id}`,
        },
      }
    }
    const user = users.get(segment.id)
    return {
      type: `userReference`,
      attrs: {
        id: segment.id,
        label: user?.displayName ?? `User ${segment.id}`,
        detail: user ? `@${user.username}${user.isActive && !user.bannedAt ? `` : ` · inactive`}` : `User #${segment.id}`,
      },
    }
  }).filter(node => node.type !== `text` || Boolean(node.text))

  return { type: `doc`, content: [{ type: `paragraph`, ...(nodes.length ? { content: nodes } : {}) }] }
}

export const serializePlayerNoteDocument = (document: JSONContent): string => serializeNode(document)

export const filterPlayerNoteSuggestions = (
  kind: `action` | `user`,
  query: string,
  actions: readonly PlayerAction[],
  users: readonly PlayerNoteUserReference[],
): PlayerNoteSuggestion[] => {
  const normalized = query.trim().toLocaleLowerCase()
  const items = kind === `action`
    ? actions.map(action => ({
      kind,
      id: action.id,
      label: actionLabel(action),
      detail: formatActionTooltip(action),
      playerId: action.playerId,
      search: `${actionLabel(action)} ${action.reason ?? ``}`.toLocaleLowerCase(),
      priority: score(actionLabel(action), action.reason ?? ``, normalized),
    }))
    : users.map(user => ({
      kind,
      id: user.id,
      label: user.displayName,
      detail: `@${user.username}${user.isActive && !user.bannedAt ? `` : ` · inactive`}`,
      search: `${user.displayName} ${user.username}`.toLocaleLowerCase(),
      priority: score(user.displayName, user.username, normalized),
    }))

  return items
    .filter(item => !normalized || item.search.includes(normalized))
    .sort((left, right) => left.priority - right.priority || right.id - left.id)
    .slice(0, 12)
    .map(({ search: _search, priority: _priority, ...item }) => item)
}

export const playerNoteSuggestionEmptyLabel = (kind: `action` | `user`) =>
  kind === `action` ? `No actions found` : `No users found`

export const referenceDeleteRange = (
  selection: { from: number, to: number },
  reference: ReferenceRange | null,
  direction: `backward` | `forward`,
): { from: number, to: number } | null => {
  if (!reference || selection.from !== selection.to) return null
  const adjacent = direction === `backward`
    ? selection.from === reference.to
    : selection.from === reference.from
  return adjacent ? { from: reference.from, to: reference.to } : null
}

export const createPlayerNoteExtensions = (labels: PlayerNoteEditorLabels) => [
  StarterKit.configure({
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    bold: false,
    italic: false,
    strike: false,
    link: false,
    dropcursor: false,
  }),
  actionReference,
  userReference,
  suggestionExtension(labels),
]

const actionReference = referenceNode(`action`)
const userReference = referenceNode(`user`)

function referenceNode(kind: `action` | `user`) {
  const type = `${kind}Reference`
  const marker = kind === `action` ? `#` : `@`
  return Node.create({
    name: type,
    group: `inline`,
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: element => Number(element.getAttribute(`data-reference-id`)) || null,
          renderHTML: () => ({}),
        },
        label: {
          default: null,
          parseHTML: element => element.textContent?.slice(1) ?? null,
          renderHTML: () => ({}),
        },
        detail: {
          default: null,
          parseHTML: element => element.getAttribute(`title`),
          renderHTML: () => ({}),
        },
        ...(kind === `action` ? {
          playerId: {
            default: null,
            parseHTML: (element: HTMLElement) => Number(element.getAttribute(`data-player-id`)) || null,
            renderHTML: () => ({}),
          },
        } : {}),
      }
    },
    parseHTML() {
      return [{ tag: `span[data-note-reference="${kind}"]` }]
    },
    renderHTML({ node, HTMLAttributes }) {
      return [
        `span`,
        mergeAttributes(HTMLAttributes, {
          class: `player-note-reference player-note-reference--${kind}`,
          'data-note-reference': kind,
          'data-reference-id': String(node.attrs.id),
          title: node.attrs.detail ?? node.attrs.label,
          ...(kind === `action` && node.attrs.playerId
            ? { 'data-player-id': String(node.attrs.playerId) }
            : {}),
        }),
        `${marker}${node.attrs.label}`,
      ]
    },
    renderText({ node }) {
      return `${marker}${node.attrs.label}`
    },
    addKeyboardShortcuts() {
      const remove = (direction: `backward` | `forward`) => {
        const { state, view } = this.editor
        const { from, to, empty } = state.selection
        if (!empty) return false
        const resolved = state.doc.resolve(from)
        const node = direction === `backward` ? resolved.nodeBefore : resolved.nodeAfter
        if (!node || (node.type.name !== `actionReference` && node.type.name !== `userReference`)) return false
        const reference = direction === `backward`
          ? { from: from - node.nodeSize, to: from, type: node.type.name as ReferenceRange[`type`] }
          : { from, to: from + node.nodeSize, type: node.type.name as ReferenceRange[`type`] }
        const range = referenceDeleteRange({ from, to }, reference, direction)
        if (!range) return false
        view.dispatch(state.tr.delete(range.from, range.to))
        return true
      }
      return {
        Backspace: () => remove(`backward`),
        Delete: () => remove(`forward`),
      }
    },
  })
}

const suggestionExtension = (labels: PlayerNoteEditorLabels) => Extension.create({
  name: `playerNoteSuggestions`,
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey(`playerNoteActionSuggestion`),
        char: `#`,
        items: ({ query }) => filterPlayerNoteSuggestions(`action`, query, labels.actions, labels.users),
        command: ({ editor, range, props }) => editor.chain().focus().insertContentAt(range, [
          { type: `actionReference`, attrs: props },
          { type: `text`, text: ` ` },
        ]).run(),
        render: () => suggestionPopup(`action`),
      }),
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey(`playerNoteUserSuggestion`),
        char: `@`,
        items: ({ query }) => filterPlayerNoteSuggestions(`user`, query, labels.actions, labels.users),
        command: ({ editor, range, props }) => editor.chain().focus().insertContentAt(range, [
          { type: `userReference`, attrs: props },
          { type: `text`, text: ` ` },
        ]).run(),
        render: () => suggestionPopup(`user`),
      }),
    ]
  },
})

function suggestionPopup(kind: `action` | `user`) {
  let root: HTMLDivElement | null = null
  let selected = 0
  let current: SuggestionProps<PlayerNoteSuggestion, PlayerNoteSuggestion> | null = null

  const position = () => {
    const rect = current?.clientRect?.()
    if (!root || !rect) return
    root.style.left = `${rect.left}px`
    root.style.top = `${rect.bottom + 6}px`
  }

  const draw = () => {
    if (!root || !current) return
    root.replaceChildren()
    if (!current.items.length) {
      const empty = document.createElement(`p`)
      empty.className = `player-note-suggestions__empty`
      empty.textContent = playerNoteSuggestionEmptyLabel(kind)
      root.append(empty)
      position()
      return
    }
    current.items.forEach((item, index) => {
      const row = document.createElement(`button`)
      const label = document.createElement(`strong`)
      const detail = document.createElement(`small`)
      row.type = `button`
      row.className = `player-note-suggestion${index === selected ? ` is-selected` : ``}`
      label.textContent = `${item.kind === `action` ? `#` : `@`}${item.label}`
      detail.textContent = item.detail
      row.append(label, detail)
      row.addEventListener(`mousedown`, event => {
        event.preventDefault()
        current?.command(item)
      })
      root!.append(row)
    })
    position()
  }

  const keydown = ({ event }: SuggestionKeyDownProps) => {
    if (!current?.items.length) return false
    if (event.key === `Escape`) return true
    if (event.key === `ArrowDown` || event.key === `ArrowUp`) {
      const offset = event.key === `ArrowDown` ? 1 : -1
      selected = (selected + offset + current.items.length) % current.items.length
      draw()
      return true
    }
    if (event.key === `Enter` || event.key === `Tab`) {
      current.command(current.items[selected]!)
      return true
    }
    return false
  }

  return {
    onStart(props: SuggestionProps<PlayerNoteSuggestion, PlayerNoteSuggestion>) {
      current = props
      selected = 0
      root = document.createElement(`div`)
      root.className = `player-note-suggestions`
      document.body.append(root)
      draw()
    },
    onUpdate(props: SuggestionProps<PlayerNoteSuggestion, PlayerNoteSuggestion>) {
      current = props
      selected = Math.min(selected, Math.max(0, props.items.length - 1))
      draw()
    },
    onKeyDown: keydown,
    onExit() {
      root?.remove()
      root = null
      current = null
    },
  }
}

const serializeNode = (node: JSONContent): string => {
  if (node.type === `text`) return node.text ?? ``
  if (node.type === `actionReference`) return `#[action:${node.attrs?.id}]`
  if (node.type === `userReference`) return `@[user:${node.attrs?.id}]`
  if (node.type === `hardBreak`) return `\n`
  const children = node.content?.map(serializeNode) ?? []
  return node.type === `doc` ? children.join(`\n`) : children.join(``)
}

const score = (primary: string, secondary: string, query: string) => {
  if (!query) return 0
  const first = primary.toLocaleLowerCase()
  const second = secondary.toLocaleLowerCase()
  if (first.startsWith(query)) return 0
  if (first.includes(query)) return 1
  if (second.startsWith(query)) return 2
  return 3
}
