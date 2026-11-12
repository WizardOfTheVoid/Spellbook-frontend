<script lang="ts">
  import { tick } from 'svelte'
  import Textarea from '../Textarea.svelte'
  import Button from '../Button.svelte'
  import IconButton from '../IconButton.svelte'
  import Markdown from '$lib/components/players/notes/playerNoteMarkdown.svelte'
  import { parsePlayerNoteDisplay } from '$lib/utils/playerNoteDisplay'
  import { formatMarkdown, type MarkdownFormat } from './markdownFormatting'

  export let value = ``
  export let label = `Markdown`
  export let editable = false
  export let disabled = false
  export let maxlength = 100000
  export let onChange: (value: string) => void

  let editing = false
  let root: HTMLDivElement
  let element: HTMLTextAreaElement
  let selectionStart = 0
  let selectionEnd = 0
  let scrollTop = 0
  $: nodes = parsePlayerNoteDisplay(value)
  $: if (!editable || disabled) editing = false

  const formats: { format: MarkdownFormat, label: string, icon: string }[] = [
    { format: `bold`, label: `Bold`, icon: `fa-bold` },
    { format: `italic`, label: `Italic`, icon: `fa-italic` },
    { format: `strike`, label: `Strikethrough`, icon: `fa-strikethrough` },
    { format: `bullet`, label: `Bullet list`, icon: `fa-list-ul` },
    { format: `number`, label: `Numbered list`, icon: `fa-list-ol` },
    { format: `quote`, label: `Quote`, icon: `fa-quote-left` },
    { format: `code`, label: `Inline code`, icon: `fa-code` },
    { format: `codeBlock`, label: `Code block`, icon: `fa-file-code` }
  ]

  async function beginEditing() {
    if (!editable || disabled) return
    editing = true
    await tick()
    if (!editing || !element) return
    element.focus()
    element.setSelectionRange(selectionStart, selectionEnd)
    element.scrollTop = scrollTop
  }

  function finishEditing(event: FocusEvent) {
    if (!editing || !(event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLButtonElement)) return
    if (event.relatedTarget instanceof Node && root.contains(event.relatedTarget)) return
    if (element) {
      selectionStart = element.selectionStart
      selectionEnd = element.selectionEnd
      scrollTop = element.scrollTop
    }
    editing = false
  }

  function format(format: MarkdownFormat) {
    if (!editable || disabled || !element) return
    const change = formatMarkdown(element.value, element.selectionStart, element.selectionEnd, format)
    if (element.value.length - (change.end - change.start) + change.text.length > maxlength) return
    element.focus()
    element.setSelectionRange(change.start, change.end)
    // Chromium's insertText preserves native textarea undo for toolbar edits.
    if (!document.execCommand(`insertText`, false, change.text)) element.setRangeText(change.text, change.start, change.end)
    element.setSelectionRange(change.selectionStart, change.selectionEnd)
    onChange(element.value)
  }

  function keydown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return
    const key = event.key.toLowerCase()
    if (key !== `b` && key !== `i`) return
    event.preventDefault()
    format(key === `b` ? `bold` : `italic`)
  }
</script>

<div class="markdown-editor" bind:this={root} onfocusout={finishEditing}>
  {#if editing}
    <div class="markdown-toolbar" role="group" aria-label="Markdown formatting">
      {#each [1, 2, 3] as level}
        <Button label={`H${level}`} size="sm" title={`Heading ${level}`} {disabled} onClick={() => format(`h${level}` as MarkdownFormat)} />
      {/each}
      {#each formats as item}
        <IconButton icon={item.icon} ariaLabel={item.label} tooltip={item.label} size="sm" {disabled} onClick={() => format(item.format)} />
      {/each}
    </div>
    <Textarea bind:element {label} {value} {disabled} {maxlength} fill showLabel={false} onKeydown={keydown} {onChange} />
  {:else if editable}
    <div
      class="markdown-content"
      class:markdown-content--editable={editable && !disabled}
      role="button"
      tabindex={disabled ? undefined : 0}
      aria-label={`Edit ${label}`}
      aria-disabled={disabled ? true : undefined}
      onclick={event => {
        if ((event.target as HTMLElement).closest(`button, a`) || window.getSelection()?.type === `Range`) return
        void beginEditing()
      }}
      onkeydown={event => {
        if (event.target !== event.currentTarget || (event.key !== `Enter` && event.key !== ` `)) return
        event.preventDefault()
        void beginEditing()
      }}
    >
      {@render preview()}
    </div>
  {:else}
    <div class="markdown-content" aria-label={label}>{@render preview()}</div>
  {/if}
</div>

{#snippet preview()}
  {#if value}<Markdown {nodes}>{#snippet reference(value)}{value.kind} {value.id}{/snippet}</Markdown>
  {:else}<span class="markdown-empty">{editable ? `Click to add guidelines…` : `No guidelines yet.`}</span>{/if}
{/snippet}

<style>
  .markdown-editor { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; gap: var(--gutter-sm); }
  .markdown-toolbar { display: flex; flex-wrap: wrap; gap: var(--gutter-xs); flex-shrink: 0; }
  .markdown-content { flex: 1; min-height: 0; overflow: auto; padding: var(--gutter-lg); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); white-space: pre-wrap; overflow-wrap: anywhere; font-synthesis: style; }
  .markdown-content--editable { cursor: text; }
  .markdown-content--editable:focus-visible { outline: 1px solid var(--color-accent-primary); outline-offset: -1px; }
  .markdown-empty { color: var(--color-light-tertiary); }
</style>
