<script lang="ts">
	import Icon from "$lib/components/ui/Icon.svelte"
	import { tooltip } from "$lib/utils/tooltip"
</script>

<span role="img" aria-label="Player is wanted" use:tooltip={`Player is wanted`}>
	<Icon name="fa-triangle-exclamation" type="solid" size="xs" tone="var(--color-danger)" />
</span>
