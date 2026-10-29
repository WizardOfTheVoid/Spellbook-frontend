<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import IconBadge from "$lib/components/ui/IconBadge.svelte";
	import {
		loadSettings,
		settingsSnapshot,
		updateSettings,
	} from "$lib/settings/settings-store";
	import {
		isConsoleKeyCode,
		type ConsoleKeyCode,
	} from "../../../../../shared/consoleKey";
	import {
		defaultKeybinds,
		isShortcutKeyCode,
		keybindConflict,
		keybindLabel,
		keybindNames,
		type KeybindName,
		type ShortcutKeyCode,
	} from "../../../../../shared/keybinds";
	import { getCoreApi, getOverlayApi } from "$lib/core";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import KeybindValue from "$lib/components/ui/KeybindValue.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import {
		ConsoleBindController,
		type ConsoleBindState,
	} from "./consoleBindController";

	export let name: KeybindName = `consoleKey`;
	export let disabled = false;
	export let hidden = false;
	export let busy = false;
	export let compact = false;
	export let field = false;
	export let hint = ``;
	export let savedContext = ``
	export let onSaved: (() => void) | null = null;

	let state: ConsoleBindState;
	const controller = new ConsoleBindController<
		ConsoleKeyCode | ShortcutKeyCode
	>(
		{
			load: async () => Boolean(await loadSettings()),
			save: async (code) => {
				if (name === `consoleKey`) {
					const saved = await getCoreApi().recordConsoleKey(
						(code ?? defaultKeybinds.consoleKey) as ConsoleKeyCode,
					);
					if (saved) await loadSettings();
					return saved;
				}
				return Boolean(
					await updateSettings({ [name]: code ?? defaultKeybinds[name] }),
				);
			},
		},
		(next) => (state = next),
		keybindNames[name],
	);
	state = controller.state;

	$: key = $settingsSnapshot?.settings[name] ?? defaultKeybinds[name];
	$: label = keybindNames[name];
	$: retryConsoleLoad = name === `consoleKey` && state.retry === `load`;
	$: recordingChanged(state.recording);
	$: busy = state.busy;
	$: hint =
		state.saved && savedContext ? `${label} saved ${savedContext}.` : state.message ||
		(state.recording ? `Press a key to record. Escape cancels.`
		: field ? ``
		: `Click the key to record a replacement.`);
	$: if (disabled || hidden) controller.cancelRecording();

	onMount(() => {
		if (!$settingsSnapshot) void controller.load();
	});
	let wasRecording = false;
	let active = true;
	function recordingChanged(recording: boolean): void {
		if (recording === wasRecording) return;
		wasRecording = recording;
		void getOverlayApi()
			.setKeybindRecording(recording)
			.catch((error) => notifyError(String(error)));
	}
	onDestroy(() => {
		active = false;
		controller.destroy();
		if (wasRecording)
			void getOverlayApi()
				.setKeybindRecording(false)
				.catch((error) => notifyError(String(error)));
	});

	async function toggleRecording(): Promise<void> {
		if (retryConsoleLoad) {
			await controller.retry();
			return;
		}
		if (state.recording) controller.cancelRecording(true);
		else {
			try {
				await getOverlayApi().setKeybindRecording(true);
				if (!active || disabled || hidden || !document.hasFocus()) {
					await getOverlayApi().setKeybindRecording(false);
					return;
				}
				controller.startRecording();
			} catch (error) {
				notifyError(String(error));
			}
		}
	}

	function capture(event: KeyboardEvent): void {
		if (!state.recording || disabled || hidden) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.code === `Escape`) {
			controller.cancelRecording(true);
			return;
		}
		const code = event.code;
		const valid =
			name === `consoleKey` ? isConsoleKeyCode(code) : isShortcutKeyCode(code);
		if (
			!valid ||
			event.ctrlKey ||
			event.altKey ||
			event.shiftKey ||
			event.metaKey ||
			event.repeat ||
			event.isComposing
		) {
			controller.rejectKey();
			return;
		}
		const conflict = keybindConflict({
			...defaultKeybinds,
			...$settingsSnapshot?.settings,
			[name]: code,
		});
		if (conflict) {
			controller.rejectKey(conflict);
			return;
		}
		void saveKey(code as ConsoleKeyCode | ShortcutKeyCode);
	}

	async function saveKey(code: ConsoleKeyCode | ShortcutKeyCode) {
		if ((await controller.save(code)) && active) onSaved?.();
	}
</script>

<svelte:window
	on:keydown|capture={capture}
	on:blur={() => controller.cancelRecording()}
/>

<div
	class="console-bind"
	class:console-bind--compact={compact}
	class:console-bind--field={field}
	{hidden}
>
	{#if !compact}<IconBadge name="fa-keyboard" tone="accent" />{/if}
	{#if !field}<div class="console-bind__copy">
			<strong>{compact && name === `consoleKey` ? `Console key` : label}</strong
			>
			{#if !compact}<small
					>{name === `consoleKey` ? `Use the key for the console in Chivalry 2.`
					: name === `overlayKey` ? `Open or close SpellBook.`
					: `Detect the in-game player and open their details.`} Saved on this computer.</small
				>{/if}
		</div>{/if}
	<div class="console-bind__controls">
		<button
			type="button"
			class:recording={state.recording}
			aria-label={retryConsoleLoad ? `Retry loading ${label}`
			: state.recording ? `Press a key for ${label}; Escape cancels`
			: `Record ${label}: ${keybindLabel(key)}`}
			aria-pressed={state.recording}
			disabled={disabled ||
				state.loading ||
				state.saving ||
				(!$settingsSnapshot && !retryConsoleLoad)}
			on:blur={() => controller.cancelRecording()}
			on:click={toggleRecording}
			>{#if state.busy}{state.loading ? `Loading...`
				: state.saving ? `Saving...`
				: `Press a key...`}{:else}<KeybindValue
					styled={false}
					{name}
				/>{/if}{#if field && !state.busy}<Icon
					name="fa-pen"
					size="sm"
				/>{/if}</button
		>
		{#if name !== `consoleKey`}<button
				type="button"
				disabled={disabled ||
					state.busy ||
					!$settingsSnapshot ||
					key === defaultKeybinds[name]}
				on:click={() => void controller.save(null)}>Reset</button
			>
			{#if state.retry}
				<button
					type="button"
					disabled={disabled || state.busy}
					on:click={() => void controller.retry()}>Retry</button
				>
			{/if}
		{/if}
	</div>
	{#if !field && (!compact || state.message || state.recording)}<small
			class="console-bind__hint"
			aria-live="polite"
		>
			{hint}
		</small>{/if}
</div>

<style lang="scss">
	.console-bind {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-md);
		background: var(--color-dark-primary);
	}

	.console-bind[hidden] {
		display: none;
	}
	.console-bind__copy {
		display: grid;
		gap: var(--gutter-sm);
	}
	strong {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
	}
	small {
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
	}
	.console-bind__controls {
		grid-column: 1 / -1;
		display: flex;
		gap: var(--gutter-sm);
	}
	.console-bind__controls button {
		min-height: var(--control-height-md);
		padding: 0 var(--gutter-md);
		border-radius: var(--radius);
		border: 1px solid var(--color-dark-secondary);
		font-size: var(--font-size-xs);
	}
	.console-bind__controls button:first-child {
		flex: 1;
	}
	.console-bind__controls .recording {
		border-color: var(--color-accent-primary);
	}
	.console-bind__hint {
		grid-column: 1 / -1;
	}
	.console-bind--compact {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: var(--gutter-sm) var(--gutter-md);
		border: 0;
		border-radius: 0;
		padding: 0;
		background: transparent;
	}
	.console-bind--compact .console-bind__controls {
		grid-column: auto;
	}
	.console-bind--compact .console-bind__controls button {
		min-height: var(--control-height-sm);
	}
	.console-bind--compact .console-bind__controls button:first-child {
		min-width: 72px;
	}
	.console-bind--field {
		grid-template-columns: minmax(0, 1fr);
	}
	.console-bind--field .console-bind__controls button:first-child {
		display: flex;
		align-items: center;
		justify-content: space-between;
		min-height: var(--control-height-lg);
		width: 100%;
		background: transparent;
		border: 2px dashed var(--color-dark-secondary);
		text-align: left;
		font-size: var(--font-size-md);
	}
	.console-bind--field .console-bind__controls button:focus-visible,
	.console-bind--field .console-bind__controls button.recording {
		outline: none;
		border-color: var(--color-accent-primary);
	}
</style>
