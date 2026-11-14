export const avatarSizes = {
  xs: `20px`,
  sm: `28px`,
  md: `36px`,
  lg: `var(--avatar-size)`,
  xl: `48px`
} as const

export type AvatarSize = keyof typeof avatarSizes | number

export type AvatarProps = {
  src?: string | null
  name?: string | null
  size?: AvatarSize
  class?: string
  fallbackIcon?: string
  fallbackType?: `light` | `solid` | `brands`
  fallbackTone?: string
}
