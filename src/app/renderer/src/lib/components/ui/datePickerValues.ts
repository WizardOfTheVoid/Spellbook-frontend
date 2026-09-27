export function pickerDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (match[4] && (Number(match[4]) > 23 || Number(match[5]) > 59)) return null
  const date = new Date(0)
  date.setFullYear(year, month - 1, day)
  date.setHours(12, 0, 0, 0)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

export function pickerValue(date: Date | number | null, time: string | null = null): string {
  if (date === null) return ``
  const selected = new Date(date)
  if (Number.isNaN(selected.getTime())) return ``
  const year = String(selected.getFullYear()).padStart(4, `0`)
  const month = String(selected.getMonth() + 1).padStart(2, `0`)
  const day = String(selected.getDate()).padStart(2, `0`)
  return `${year}-${month}-${day}${time === null ? `` : `T${time}`}`
}

export function formatPickerDate(value: string, includeYear = true): string {
  const date = pickerDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat(`en-US`, {
    month: `short`, day: `numeric`, year: includeYear ? `numeric` : undefined,
  }).format(date)
}

export function pickerRangeLabels(start: string, end: string): { start: string, end: string } {
  const startDate = pickerDate(start)
  const endDate = pickerDate(end)
  return {
    start: formatPickerDate(start, !startDate || !endDate || startDate.getFullYear() !== endDate.getFullYear()),
    end: formatPickerDate(end),
  }
}

export function withinPickerBounds(value: string, min: string | null, max: string | null): boolean {
  return Boolean(pickerDate(value) && (!min || value >= min) && (!max || value <= max))
}

export function enabledPickerDates(min: string, max: string): string[] {
  const start = pickerDate(min)
  const end = pickerDate(max)
  if (!start || !end || start > end) return []
  const dates: string[] = []
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    dates.push(date.toDateString())
  }
  return dates
}

export function datePickerOverlayPosition(
  trigger: Pick<DOMRect, `left` | `top` | `bottom`>,
  picker: { width: number, height: number },
  viewport: { width: number, height: number }
): { x: number, y: number } {
  const margin = 12
  const gap = 4
  const width = Math.min(picker.width, viewport.width - margin * 2)
  const height = Math.min(picker.height, viewport.height - margin * 2)
  const x = Math.max(margin, Math.min(trigger.left, viewport.width - width - margin))
  const below = trigger.bottom + gap
  const above = trigger.top - height - gap
  const y = below + height <= viewport.height - margin ? below
    : above >= margin ? above
    : Math.max(margin, Math.min(below, viewport.height - height - margin))
  return { x, y }
}
