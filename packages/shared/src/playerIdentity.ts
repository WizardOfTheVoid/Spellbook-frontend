export function hasKnownPlayfabId(value: string | null | undefined): value is string {
  const id = value?.trim()
  return Boolean(id && id.toUpperCase() !== `NULL`)
}
