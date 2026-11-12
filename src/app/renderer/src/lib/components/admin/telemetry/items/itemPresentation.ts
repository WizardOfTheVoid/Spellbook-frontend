const folderTags: Record<string, string> = {
  MeleeWeapons: `Melee`,
  RangedWeapons: `Ranged`,
  Shields: `Shield`,
  Carryables: `Carryable`,
  Novelty: `Novelty`,
  Deployables: `Deployable`,
  SiegeEngines: `Siege inventory`
}

const itemKinds: Record<string, string> = {
  Weapon: `Weapon`,
  WeaponRack: `Weapon rack`,
  BaseWeaponRack: `Weapon rack`,
  Carryable: `Carryable`,
  Novelty: `Novelty`,
  Projectile: `Projectile`,
  Deployable: `Deployable`
}

const words = (value: string) => value
  .replace(/([A-Z]+)([A-Z][a-z])/g, `$1 $2`)
  .replace(/([a-z\d])([A-Z])/g, `$1 $2`)
  .replace(/_+/g, ` `)
  .trim()

export function itemPresentation(value: string | null) {
  const fallback = { label: value ?? `—`, tags: [] as string[], raw: value }
  if (!value?.startsWith(`/`)) return fallback

  const folders = value.split(`/`)
  const leaf = folders.pop()?.split(`.`).at(-1) ?? ``
  const name = leaf.replace(/^Default__/, ``).replace(/^BP_/, ``).replace(/_C(?=_\d+$|$)/, ``)
  if (!name) return fallback

  const prefix = name.split(`_`)[0]
  const kind = name.includes(`_`) ? itemKinds[prefix] : undefined
  const category = kind && folders.includes(`SiegeEngines`) ? `Inventory` : kind
  const label = category ? `${category} · ${words(name.slice(prefix.length + 1))}` : words(name)
  const tags = [...new Set(folders.map(folder => folderTags[folder]).filter(tag => tag && tag !== category))]
  return { label, tags, raw: value }
}
