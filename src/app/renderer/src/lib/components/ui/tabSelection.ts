export function selectTabValue(
  next: string, current: string, onChange: (value: string) => void,
  onReselect: ((value: string) => void) | null = null,
): void {
  if (next === current) onReselect?.(next)
  else onChange(next)
}
