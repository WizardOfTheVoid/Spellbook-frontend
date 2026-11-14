import type { FormOption } from '$lib/types/ui'

export function selectOnlySearchResult(
  event: Pick<KeyboardEvent, `key` | `isComposing` | `preventDefault`>,
  options: readonly FormOption[],
  onSelect: (option: FormOption) => void
): boolean {
  if (event.key !== `Enter` || event.isComposing) return false
  event.preventDefault()
  const option = options.length === 1 ? options[0] : undefined
  if (option && !option.disabled) onSelect(option)
  return true
}
