export function absoluteUtc(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new RangeError(`Use an ISO date with Z or an explicit UTC offset.`)
  const date = value.slice(0, 10)
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new RangeError(`Invalid calendar date.`)
  return new Date(value).toISOString()
}
export function validTimezone(value: string): boolean {
  try { new Intl.DateTimeFormat(`en`, { timeZone: value }); return true } catch { return false }
}
