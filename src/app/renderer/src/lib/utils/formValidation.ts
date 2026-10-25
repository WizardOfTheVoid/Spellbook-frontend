import { tick } from 'svelte'

export async function focusInvalidField(root: HTMLElement): Promise<void> {
  await tick()
  const invalid = root.querySelector<HTMLElement>(`[aria-invalid="true"]:not(:disabled), [data-invalid]`)
  const field = invalid?.matches(`input, button, textarea`) ? invalid
    : invalid?.querySelector<HTMLElement>(`input:not(:disabled), button:not(:disabled), textarea:not(:disabled)`)
  field?.focus()
  field?.scrollIntoView({ block: `nearest` })
}
