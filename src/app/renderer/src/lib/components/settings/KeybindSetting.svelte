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
	import { getOverlayApi } from "$lib/core";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import KeybindValue from "$lib/components/ui/KeybindValue.svelte";
	import {
		ConsoleBindController,
		type ConsoleBindState,
	} from "./consoleBindController";

	export let name: KeybindName = `consoleKey`;
	export let disabled = false;
	export let hidden = false;
	export let busy = false;

	let state: ConsoleBindState;
	const controller = new ConsoleBindController<
		ConsoleKeyCode | ShortcutKeyCode
	>(
		{
			load: async () => Boolean(await loadSettings()),
			save: async (code) =>
				Boolean(
					await updateSettings({ [name]: code ?? defaultKeybinds[name] }),
				),
		},
		(next) => (state = next),
		keybindNames[name],
	);
	state = controller.state;

	$: key = $settingsSnapshot?.settings[name] ?? defaultKeybinds[name];
	$: label = keybindNames[name];
	$: recordingChanged(state.recording);
	$: busy = state.busy;
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
		void controller.save(code as ConsoleKeyCode | ShortcutKeyCode);
	}
</script>

<svelte:window
	on:keydown|capture={capture}
	on:blur={() => controller.cancelRecording()}
/>

<div class="console-bind" {hidden}>
	<IconBadge name="fa-keyboard" tone="accent" />
	<div class="console-bind__copy">
		<strong>{label}</strong>
		<small
			>{name === `consoleKey` ? `Use the key for the console in Chivalry 2.`
			: name === `overlayKey` ? `Open or close SpellBook.`
			: `Detect the in-game player and open their details.`} Saved on this computer.</small
		>
	</div>
	<div class="console-bind__controls">
		<button
			type="button"
			class:recording={state.recording}
			aria-label={state.recording ?
				`Press a key for ${label}; Escape cancels`
			:	`Record ${label}: ${keybindLabel(key)}`}
			aria-pressed={state.recording}
			disabled={disabled || state.loading || state.saving || !$settingsSnapshot}
			on:blur={() => controller.cancelRecording()}
			on:click={toggleRecording}
			>{#if state.busy}{state.loading ? `Loading...`
				: state.saving ? `Saving...`
				: `Press a key...`}{:else}<KeybindValue
					styled={false}
					{name}
				/>{/if}</button
		>
		<button
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
	</div>
	<small class="console-bind__hint" aria-live="polite">
		{state.message ||
			(state.recording ?
				`Press one key without modifiers. Escape cancels.`
			:	`Click the key to record a replacement.`)}
	</small>
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
</style>
