import { pickerValue } from '$lib/components/ui/datePickerValues'

export const playerArchiveStart = `2021-06-08`

export function playerDatePresets(today: Date): { label: string, start: number | null, end: number | null }[] {
  const earliest = new Date(2021, 5, 8, 12).getTime()
  const recent = [30, 60, 90].map(days => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - days + 1, 12)
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12)
    return { label: `Last ${days} days`, start: Math.max(start.getTime(), earliest), end: end.getTime() }
  })
  return [{ label: `All time`, start: null, end: null }, ...recent]
}

export function playerRangeValues(start: Date | number | null, end: Date | number | null): { createdAfter: string, createdBefore: string } {
  return { createdAfter: pickerValue(start), createdBefore: pickerValue(end) }
}

export function playerLastSeenRangeValues(start: Date | number | null, end: Date | number | null): { lastSeenAfter: string, lastSeenBefore: string } {
  return { lastSeenAfter: pickerValue(start), lastSeenBefore: pickerValue(end) }
}
