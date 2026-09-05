export const serverProfileActionIcons = [
  { key: `ban`, label: `Ban`, name: `fa-ban`, type: `light` },
  { key: `gavel`, label: `Gavel`, name: `fa-gavel`, type: `light` },
  { key: `triangle-exclamation`, label: `Kick`, name: `fa-triangle-exclamation`, type: `light` },
  { key: `bullhorn`, label: `Warn`, name: `fa-bullhorn`, type: `light` },
  { key: `discord`, label: `Discord`, name: `fa-discord`, type: `brands` },
  { key: `circle-info`, label: `Information`, name: `fa-circle-info`, type: `light` },
  { key: `circle-question`, label: `Question`, name: `fa-circle-question`, type: `light` },
  { key: `gamepad`, label: `Gamepad`, name: `fa-gamepad`, type: `light` }
] as const

export type ServerProfileActionIconKey = typeof serverProfileActionIcons[number][`key`]
export const serverProfileActionIconKeys = serverProfileActionIcons.map(icon => icon.key)
