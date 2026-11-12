<script lang="ts">
  import IconBadge from '../IconBadge.svelte'
  import AvatarBase from './avatarBase.svelte'
  import type { AvatarProps } from './avatarSizes'

  let { size = `sm`, class: className = ``, fallbackIcon = `fa-user`, fallbackType = `light`, fallbackTone = `var(--color-light-primary)`, ...props }: AvatarProps = $props()
</script>

<AvatarBase {...props} {size} class={`avatar-user ${fallbackTone === `inherit` ? `avatar-user--inherit` : ``} ${className}`} radius="50%" fit="cover">
  {#snippet fallback()}<IconBadge name={fallbackIcon} iconType={fallbackType} iconColor={fallbackTone} size={size === `sm` || size === `xs` ? `sm` : size === `md` ? `md` : `lg`} shape="round" />{/snippet}
</AvatarBase>

<style>
  :global(.avatar.avatar-user--inherit .icon-badge) { color: inherit; }
</style>
