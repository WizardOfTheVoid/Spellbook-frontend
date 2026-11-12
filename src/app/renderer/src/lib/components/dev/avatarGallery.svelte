<script lang="ts">
  import AvatarTeam from '$lib/components/ui/avatars/avatarTeam.svelte'
  import AvatarUser from '$lib/components/ui/avatars/avatarUser.svelte'
  import { avatarSizes } from '$lib/components/ui/avatars/avatarSizes'
  import Button from '$lib/components/ui/Button.svelte'

  const image = (content: string) => `data:image/svg+xml,${encodeURIComponent(content)}`
  const team = image(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="#7958c7" d="M0 0h96v64H0z"/><path fill="#fff" d="m48 10 20 14-8 25H36l-8-25z"/></svg>`)
  const transparentTeam = image(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><path fill="#a0dff3" d="m48 0 32 20-12 44H28L16 20z"/></svg>`)
  const user = image(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><path fill="#de9d59" d="M0 0h80v100H0z"/><circle cx="40" cy="34" r="18" fill="#fff"/><path fill="#fff" d="M10 100V80a30 30 0 0 1 60 0v20z"/></svg>`)
  const broken = `data:image/png;base64,invalid`
  let source: string | null = broken
</script>

<div class="avatar-gallery">
  <div class="avatar-gallery__presets">
    {#each Object.keys(avatarSizes) as size}
      <div class="avatar-gallery__specimen">
        <code>{size}</code>
        <AvatarTeam src={team} name="Team" size={size as keyof typeof avatarSizes} />
        <AvatarTeam name="Team without a logo" size={size as keyof typeof avatarSizes} />
        <AvatarUser src={user} name="User" size={size as keyof typeof avatarSizes} />
        <AvatarUser name="User without a photo" size={size as keyof typeof avatarSizes} />
      </div>
    {/each}
  </div>
  <div class="avatar-gallery__examples">
    <AvatarTeam src={transparentTeam} name="Transparent team logo" size={64.8} />
    <AvatarTeam src=" " name="Empty team logo" />
    <AvatarUser src={user} name="Large user portrait" size={88} />
    <AvatarUser src=" " name="Empty user photo" size={76} />
  </div>
  <div class="avatar-gallery__examples">
    <AvatarTeam src={source} name="Team image recovery" />
    <AvatarUser src={source} name="User image recovery" size="xl" />
    <Button label="Use valid image" onClick={() => source = team} />
    <Button label="Use broken image" onClick={() => source = broken} />
    <Button label="Remove image" onClick={() => source = null} />
  </div>
</div>

<style>
  .avatar-gallery { display: grid; gap: var(--gutter-lg); }
  .avatar-gallery__presets { display: flex; flex-wrap: wrap; align-items: start; gap: var(--gutter-lg); }
  .avatar-gallery__specimen { display: grid; justify-items: center; gap: var(--gutter-md); }
  .avatar-gallery__examples { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md); }
</style>
