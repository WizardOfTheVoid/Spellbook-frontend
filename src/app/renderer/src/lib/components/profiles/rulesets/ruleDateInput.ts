import { Temporal } from '@js-temporal/polyfill'
import { absoluteUtc } from '@spellbook/shared/actions/actionTime'

export function ruleDateInput(value: string, zone: string): string {
  return value ? Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: `minute` }) : ``
}

export function ruleDateValue(value: string, zone: string, previous = ``): string {
  if (!value) return ``
  if (previous && value === ruleDateInput(previous, zone)) return previous
  const local = Temporal.PlainDateTime.from(value)
  const zoned = local.toZonedDateTime(zone, { disambiguation: `earlier` })
  if (!zoned.toPlainDateTime().equals(local)) throw new RangeError(`This time does not exist because the clocks change. Choose another time.`)
  return absoluteUtc(zoned.toInstant().toString({ smallestUnit: `millisecond` }))
}

export function repeatedRuleDate(value: string, zone: string): boolean {
  if (!value) return false
  const local = Temporal.PlainDateTime.from(value)
  const earlier = local.toZonedDateTime(zone, { disambiguation: `earlier` })
  const later = local.toZonedDateTime(zone, { disambiguation: `later` })
  return earlier.toPlainDateTime().equals(local) && later.toPlainDateTime().equals(local) && !earlier.equals(later)
}

export function ruleClockInput(value: string, zone: string, referenceDate: string): string {
  return value ? ruleDateInput(`${referenceDate}T${value}:00Z`, zone).slice(11, 16) : ``
}

export function ruleClockValue(value: string, zone: string, referenceDate: string, previous = ``): string {
  if (!value) return ``
  if (previous && value === ruleClockInput(previous, zone, referenceDate)) return previous
  const utc = ruleClockChoices(value, zone, referenceDate)[0]
  if (!utc) throw new RangeError(`This time cannot be represented on the displayed date because the clocks change. Choose another time.`)
  return utc
}

export function repeatedRuleClock(value: string, zone: string, referenceDate: string): boolean {
  return Boolean(value && ruleClockChoices(value, zone, referenceDate).length > 1)
}

function ruleClockChoices(value: string, zone: string, referenceDate: string): string[] {
  const start = Temporal.Instant.from(`${referenceDate}T00:00Z`)
  const end = start.add({ hours: 24 })
  const dates = new Set([start, end.subtract({ nanoseconds: 1 })].map(instant => instant.toZonedDateTimeISO(zone).toPlainDate().toString()))
  const choices = new Set<string>()
  for (const date of dates) {
    const local = Temporal.PlainDateTime.from(`${date}T${value}`)
    for (const disambiguation of [`earlier`, `later`] as const) {
      const zoned = local.toZonedDateTime(zone, { disambiguation })
      const instant = zoned.toInstant()
      if (zoned.toPlainDateTime().equals(local) && Temporal.Instant.compare(instant, start) >= 0 && Temporal.Instant.compare(instant, end) < 0) {
        choices.add(instant.toString().slice(11, 16))
      }
    }
  }
  return [...choices].sort()
}

export function ruleClockBounds(zone: string, referenceDate: string): { start: string, end: string } {
  const nextDate = Temporal.PlainDate.from(referenceDate).add({ days: 1 }).toString()
  return { start: ruleClockInput(`00:00`, zone, referenceDate), end: ruleClockInput(`00:00`, zone, nextDate) }
}
