<script lang="ts">
  import Icon from '../Icon.svelte'
  import AvatarBase from './avatarBase.svelte'
  import type { AvatarProps } from './avatarSizes'

  let { size = `xl`, class: className = ``, fallbackIcon = `fa-users`, fallbackType = `light`, fallbackTone = `var(--color-accent-primary)`, ...props }: AvatarProps = $props()
</script>

<AvatarBase {...props} {size} class={`avatar-team ${className}`} radius="var(--radius)" fit="contain">
  {#snippet fallback()}<Icon name={fallbackIcon} type={fallbackType} tone={fallbackTone} size={size === `xs` ? `md` : `lg`} />{/snippet}
</AvatarBase>
