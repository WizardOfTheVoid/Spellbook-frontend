<script lang="ts">
	import type { GameServerRecord } from '$lib/core'
	import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { formatFullDateTime } from '$lib/utils/playerUtils'

	export let server: GameServerRecord

	const countries = new Intl.DisplayNames([`en`], { type: `region` })
	$: country = server.geoCountryCode && /^[A-Z]{2}$/u.test(server.geoCountryCode)
		? countries.of(server.geoCountryCode) : server.geoCountryCode
	$: pending = !server.geoCheckedAt && !server.geoSource
	$: hasLocation = [server.geoLatitude, server.geoLongitude, server.geoCountryCode,
		server.geoCity, server.geoTimezone].some(value => value !== null && value !== undefined)
	$: fields = [
		{ label: `City`, value: server.geoCity },
		{ label: `Country`, value: country },
		{ label: `Latitude`, value: server.geoLatitude },
		{ label: `Longitude`, value: server.geoLongitude },
		{ label: `Accuracy radius`, value: server.geoAccuracyRadiusKm === null || server.geoAccuracyRadiusKm === undefined
			? null : `${server.geoAccuracyRadiusKm} km` },
		{ label: `Timezone`, value: server.geoTimezone },
		{ label: `Source`, value: server.geoSource === `maxmind` ? `MaxMind` : server.geoSource },
		{ label: `Last lookup`, value: server.geoCheckedAt ? formatFullDateTime(server.geoCheckedAt) : null }
	]
</script>

<section class="server-meta">
	<PanelHeader variant="section" title="Meta" />
	{#if pending}
		<EmptyState title="Location pending" message="Location information is not available for this server yet." />
	{:else}
		{#if !hasLocation}
			<EmptyState title="Location unavailable" message="The lookup returned no location information." />
		{/if}
		<dl>
			{#each fields as field}
				<dt>{field.label}</dt>
				<dd>{field.value ?? `Unavailable`}</dd>
			{/each}
		</dl>
		{#if server.geoLatitude !== null && server.geoLatitude !== undefined
			|| server.geoLongitude !== null && server.geoLongitude !== undefined}
			<small>Coordinates show an estimated location. The accuracy radius describes the surrounding area.</small>
		{/if}
	{/if}
</section>

<style lang="scss">
	.server-meta {
		display: grid;
		gap: 1rem;
	}

	dl {
		display: grid;
		grid-template-columns: minmax(0, 10rem) minmax(0, 1fr);
		gap: 0.75rem 1rem;
		margin: 0;
	}

	dt, small {
		opacity: 0.7;
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
</style>
