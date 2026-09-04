<script lang="ts">
  import { onDestroy, onMount } from "svelte"
  import { Editor, type JSONContent } from "@tiptap/core"
  import type { PlayerAction, PlayerNoteUserReference } from "$lib/core"
  import {
    createPlayerNoteDocument,
    createPlayerNoteExtensions,
    serializePlayerNoteDocument,
  } from "$lib/utils/playerNoteEditor"

  export let content: string
  export let actions: PlayerAction[] = []
  export let users: PlayerNoteUserReference[] = []
  export let playerId: number
  export let disabled = false
  export let onChange: (content: string) => void = () => undefined
  export let onOpenAction: (actionId: number) => void = () => undefined
  export let onOpenUser: (userId: number) => void = () => undefined

  let host: HTMLDivElement
  let editor: Editor | null = null
  let renderedContent = content
  let labelsKey = ``

  onMount(() => {
    labelsKey = signature()
    editor = new Editor({
      element: host,
      extensions: createPlayerNoteExtensions({ actions, users }),
      content: createPlayerNoteDocument(content, { actions, users }),
      editable: !disabled,
      editorProps: {
        attributes: {
          class: `player-note-editor__content`,
          role: `textbox`,
          'aria-multiline': `true`,
        },
        clipboardTextSerializer: slice => serializePlayerNoteDocument({
          type: `doc`,
          content: slice.content.toJSON() as JSONContent[],
        }),
        transformPastedHTML: sanitizeReferenceHtml,
      },
      onUpdate: ({ editor: current }) => {
        renderedContent = serializePlayerNoteDocument(current.getJSON())
        onChange(renderedContent)
      },
    })
    host.addEventListener(`click`, openReference)
  })

  onDestroy(() => {
    host?.removeEventListener(`click`, openReference)
    editor?.destroy()
    editor = null
  })

  $: editor?.setEditable(!disabled)
  $: if (editor) {
    const nextLabelsKey = signature()
    if (content !== renderedContent || nextLabelsKey !== labelsKey) {
      renderedContent = content
      labelsKey = nextLabelsKey
      editor.commands.setContent(createPlayerNoteDocument(content, { actions, users }), { emitUpdate: false })
    }
  }

  function signature(): string {
    return `${actions.map(action => `${action.id}:${action.updatedAt}`).join(`,`)}|${users.map(user => `${user.id}:${user.displayName}:${user.isActive}:${user.bannedAt ?? ``}`).join(`,`)}`
  }

  function openReference(event: MouseEvent): void {
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>(`[data-note-reference]`)
      : null
    if (!target) return
    const id = Number(target.dataset.referenceId)
    if (!Number.isSafeInteger(id) || id < 1) return
    if (target.dataset.noteReference === `action`) onOpenAction(id)
    if (target.dataset.noteReference === `user`) onOpenUser(id)
  }

  function sanitizeReferenceHtml(html: string): string {
    const document = new DOMParser().parseFromString(html, `text/html`)
    for (const node of document.querySelectorAll<HTMLElement>(`[data-note-reference="action"]`)) {
      if (Number(node.dataset.playerId) !== playerId) node.replaceWith(document.createTextNode(node.textContent ?? ``))
    }
    return document.body.innerHTML
  }
</script>

<div class="player-note-editor" class:player-note-editor--disabled={disabled} bind:this={host}></div>

<style lang="scss">
  .player-note-editor {
    min-height: 7rem;
    border: 1px solid var(--color-dark-secondary);
    border-radius: var(--radius);
    background: rgba(3, 12, 18, 0.66);
    cursor: text;
  }

  .player-note-editor:focus-within {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px rgbaa(var(--color-accent-primary), 0.32);
  }

  .player-note-editor--disabled {
    opacity: 0.72;
    cursor: default;
  }

  :global(.player-note-editor__content) {
    min-height: inherit;
    padding: var(--gutter-sm) var(--gutter-md);
    outline: none;
    white-space: pre-wrap;
  }

  :global(.player-note-editor__content p) {
    margin: 0;
  }

  :global(.player-note-reference) {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    margin: 0 0.12rem;
    padding: 0.08rem 0.38rem;
    border: 1px solid rgbaa(var(--color-accent-primary), 0.5);
    border-radius: 0.35rem;
    background: transparent;
    color: var(--color-light-primary);
    line-height: 1.35;
    cursor: pointer;
    user-select: all;
    transition: border-color 120ms ease, color 120ms ease, transform 80ms ease;
  }

  :global(.player-note-reference--user) {
    border-color: rgba(118, 177, 255, 0.52);
  }

  :global(.player-note-reference:hover) {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  :global(.player-note-reference:active) {
    border-color: var(--color-light-primary);
    transform: translateY(1px);
  }

  :global(.ProseMirror-selectednode.player-note-reference) {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 1px var(--color-primary);
  }

  :global(.player-note-suggestions) {
    position: fixed;
    z-index: 1200;
    display: grid;
    width: min(24rem, calc(100vw - 2rem));
    max-height: 16rem;
    overflow-y: auto;
    border: 1px solid var(--color-dark-secondary);
    border-radius: var(--radius);
    padding: 0.25rem;
    background: var(--color-dark-primary);
    box-shadow: var(--shadow);
  }

  :global(.player-note-suggestion) {
    display: grid;
    gap: 0.1rem;
    width: 100%;
    border: 0;
    border-radius: calc(var(--radius) - 0.2rem);
    padding: 0.45rem 0.55rem;
    background: transparent;
    color: var(--color-light-primary);
    text-align: left;
  }

  :global(.player-note-suggestion small) {
    overflow: hidden;
    color: var(--color-light-tertiary);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.player-note-suggestions__empty) {
    margin: 0;
    padding: 0.55rem;
    color: var(--color-light-tertiary);
    font-size: var(--font-size-xs);
  }

  :global(.player-note-suggestion:hover),
  :global(.player-note-suggestion.is-selected) {
    background: rgbaa(var(--color-accent-primary), 0.15);
  }
</style>
