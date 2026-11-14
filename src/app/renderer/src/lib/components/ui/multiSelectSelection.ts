import type { FormOption } from '$lib/types/ui'

export function toggleMultiSelectValue(value: string[], option: FormOption, maxSelections = Infinity): string[] {
  if (option.disabled) return value
  if (value.includes(option.value)) return value.filter(entry => entry !== option.value)
  return value.length < maxSelections ? [...value, option.value] : value
}

export function allMultiSelectValues(value: string[], options: FormOption[], checked: boolean, maxSelections = Infinity): string[] {
  const disabled = value.filter(entry => options.find(option => option.value === entry)?.disabled)
  return checked ? [...new Set([...disabled, ...options.filter(option => !option.disabled).map(option => option.value)])].slice(0, maxSelections) : disabled
}
