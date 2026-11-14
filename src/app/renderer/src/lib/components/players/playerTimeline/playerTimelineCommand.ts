export function splitTimelineCommand(value: string, name?: string): { name: string, parameters: string } {
  if (name) return { name, parameters: value }
  const separator = value.search(/\s/)
  return separator < 0 ? { name: value, parameters: `` }
    : { name: value.slice(0, separator), parameters: value.slice(separator + 1) }
}
