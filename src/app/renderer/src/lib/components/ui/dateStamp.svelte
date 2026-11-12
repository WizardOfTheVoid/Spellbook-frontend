<script lang="ts">
	import type { DateStampFormat } from '@spellbook/shared/dateFormatting'
	import { formatDateStamp, formatFullDateStamp } from '@spellbook/shared/dateFormatting'
	import { timezone } from '$lib/settings/timezone'
	import { formatRelativeDateTime } from '$lib/utils/playerUtils'

	export let value: string
	export let format: DateStampFormat | `relative` = `date`
	export let styled = true

	$: full = formatFullDateStamp(value, $timezone)
	$: display = format === `relative`
		? formatRelativeDateTime(value)
		: formatDateStamp(value, format, $timezone)
</script>

{#if full === `—`}
	<span>—</span>
{:else}
	<time datetime={value} title={full} aria-label={full} class:date-stamp--unstyled={!styled}>{display}</time>
{/if}

<style>
	time.date-stamp--unstyled { color: inherit; font: inherit; }
</style>
