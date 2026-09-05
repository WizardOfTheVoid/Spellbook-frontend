<script lang="ts">
	import type { AppSettingsUpdate, SettingsDisplayOption } from "$lib/core";
	import {
		loadSettings,
		settingsSnapshot,
		updateSettings,
	} from "$lib/settings/settings-store";
	import IconBadge from "$lib/components/ui/IconBadge.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import Toggle from "$lib/components/ui/Toggle.svelte";

	export let hidden = false;

	let saving = false;
	let refreshing = false;

	$: snapshot = $settingsSnapshot;
	$: settings = snapshot?.settings;
	$: displays = snapshot?.displays ?? [];
	$: selectedDisplayId =
		settings?.selectedDisplayId ?? snapshot?.effectiveDisplayId ?? null;
	$: selectedDisplay = getSelectedDisplay(displays, selectedDisplayId);
	$: displayOptions = displays.map((display) => ({
		value: display.id.toString(),
		label: `${display.label}${display.isPrimary ? " (primary)" : ""}`,
	}));

	async function refresh(): Promise<void> {
		refreshing = true;
		await loadSettings();
		refreshing = false;
	}

	async function save(update: AppSettingsUpdate): Promise<void> {
		saving = true;
		await updateSettings(update);
		saving = false;
	}

	function onToggleAudio(audioSfxEnabled: boolean): void {
		void save({ audioSfxEnabled });
	}

	function onChangeVolume(event: Event): void {
		if (!(event.currentTarget instanceof HTMLInputElement)) return;
		void save({ audioSfxVolume: Number(event.currentTarget.value) / 100 });
	}

	function onSelectDisplay(selectedValue: string): void {
		if (selectedValue.length === 0) return;

		void save({ selectedDisplayId: Number(selectedValue) });
	}

	function getSelectedDisplay(
		displayOptions: SettingsDisplayOption[],
		displayId: number | null,
	): SettingsDisplayOption | null {
		return displayOptions.find((display) => display.id === displayId) ?? null;
	}

	function formatBounds(display: SettingsDisplayOption | null): string {
		if (!display) return "No display detected";
		return `${display.bounds.width}x${display.bounds.height} @ ${display.bounds.x},${display.bounds.y}`;
	}
</script>

<section {hidden} class="panel-view settings-view" aria-label="Settings">
	<PanelHeader title="Settings" eyebrow="App">
		<svelte:fragment slot="trailing">
			<IconButton
				icon="fa-rotate"
				ariaLabel="Refresh settings"
				disabled={refreshing || saving}
				onClick={refresh}
			/>
		</svelte:fragment>
	</PanelHeader>

	<div class="settings-list">
		<div class="settings-row">
			<IconBadge name="fa-volume-high" tone="accent" />
			<span class="settings-row__copy">
				<strong>Audio SFX</strong>
				<small>{settings?.audioSfxEnabled ? "Enabled" : "Muted"}</small>
			</span>
			<Toggle
				label="Audio SFX"
				showLabel={false}
				checked={settings?.audioSfxEnabled === true}
				disabled={!settings || saving}
				onChange={onToggleAudio}
			/>
		</div>

		<div class="settings-row settings-row--stacked">
			<IconBadge name="fa-sliders" tone="accent" />
			<span class="settings-row__copy">
				<strong>SFX volume</strong>
				<small>{Math.round((settings?.audioSfxVolume ?? 0) * 100)}%</small>
			</span>
			<input
				class="settings-slider"
				type="range"
				min="0"
				max="100"
				step="5"
				aria-label="SFX volume"
				data-uisfx="volume-change"
				value={Math.round((settings?.audioSfxVolume ?? 0) * 100)}
				disabled={!settings || saving}
				on:change={onChangeVolume}
			/>
		</div>

		<div class="settings-row settings-row--stacked">
			<IconBadge name="fa-display" tone="accent" />
			<span class="settings-row__copy">
				<strong>Monitor</strong>
				<small>{formatBounds(selectedDisplay)}</small>
			</span>
			<Select
				id="settings-monitor"
				label="Monitor"
				showLabel={false}
				options={displayOptions}
				value={selectedDisplayId?.toString() ?? ""}
				disabled={displays.length === 0 || saving}
				onChange={onSelectDisplay}
			/>
		</div>
	</div>
</section>

<style lang="scss">
	.settings-view {
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		padding: var(--panel-padding);
	}

	.settings-list {
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-md);
		overflow: auto;
	}

	.settings-row {
		min-width: 0;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-md);
		background: var(--color-dark-primary);
	}

	.settings-row--stacked {
		grid-template-columns: auto minmax(0, 1fr);
	}

	.settings-row--stacked :global(.ui-select) {
		grid-column: 1 / -1;
	}

	.settings-slider {
		grid-column: 1 / -1;
		width: 100%;
		accent-color: var(--color-accent-primary);
	}

	.settings-row__copy {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}

	.settings-row__copy strong {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
	}

	.settings-row__copy small {
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		overflow-wrap: anywhere;
	}
</style>
