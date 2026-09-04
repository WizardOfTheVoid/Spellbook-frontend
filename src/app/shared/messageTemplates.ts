export type TemplateVariable = Readonly<{ key: string, value: string }>
export type TemplateValues = Readonly<Record<string, string>>

export const messageTemplatePattern = /\[([a-z][a-z0-9_]*)(?:\|([^\]]*))?\]/gu

export function resolveTemplate(
  template: string,
  builtIns: TemplateValues,
  variables: readonly TemplateVariable[] = []
): string {
  const values = new Map(variables.map(variable => [variable.key, variable.value]))
  for (const [key, value] of Object.entries(builtIns)) values.set(key, value)

  return template.replace(messageTemplatePattern, (_tag, key: string, fallback: string | undefined) => {
    const value = values.get(key)
    return value?.trim() ? value : fallback ?? ``
  })
}

export function findMissingTemplateVariables(
  templates: readonly string[],
  variables: readonly TemplateVariable[],
  ignoredKeys: ReadonlySet<string> = new Set()
): string[] {
  const values = new Map(variables.map(variable => [variable.key, variable.value]))
  const missing = new Set<string>()

  for (const template of templates) {
    for (const match of template.matchAll(messageTemplatePattern)) {
      const key = match[1]!
      if (ignoredKeys.has(key) || match[2] !== undefined || values.get(key)?.trim()) continue
      missing.add(key)
    }
  }
  return [...missing]
}
