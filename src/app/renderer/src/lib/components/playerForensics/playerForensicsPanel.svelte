<script lang="ts">
	import { authState } from "$lib/auth/user";
	import { navigation, rememberNavigation } from "$lib/navigation/navigation";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import Wip from "$lib/components/ui/wip.svelte";

	const tabs = [
		{ value: `altDetection`, label: `Alt Account Detection` },
		{ value: `friends`, label: `Friends Detection` },
		{ value: `meta`, label: `Meta/Config Detection` },
	];
	let activeTab = `altDetection`;
	rememberNavigation(
		`playerForensicsTab`,
		() => activeTab,
		(value) => {
			activeTab = value;
		},
		(value) => value,
	);

	async function selectTab(value: string): Promise<void> {
		await navigation.visit(() => {
			activeTab = value;
		});
	}
</script>

<section class="player-forensics panel-view" aria-label="Player Forensics">
	<PanelHeader eyebrow="Player Data Forensics" title="Player Forensics" />
	<div class="player-forensics__content">
		<Tabs
			items={tabs}
			value={activeTab}
			label="Player Forensics"
			fill
			onChange={(value) => void selectTab(value)}
		>
			<Wip
				title={$authState.user?.isSuperadmin ? `WIP - Access granted` : `WIP`}
			/>
		</Tabs>
	</div>
</section>

<style>
	.player-forensics {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		min-height: 0;
		height: 100%;
		padding-top: var(--gutter-lg);
	}
	.player-forensics__content {
		min-height: 0;
		overflow: auto;
		padding: 0 var(--gutter-lg) var(--gutter-lg);
	}
</style>
