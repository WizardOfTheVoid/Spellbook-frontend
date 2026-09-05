<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import {
		extractEnvelope,
		getCoreApi,
		getCoreErrorMessage,
		getOverlayApi,
		type ActiveServerProfile,
		type UserSession,
	} from "$lib/core";
	import {
		notifyError,
		notifySuccess,
	} from "$lib/notifications/notificationEvents";
	import {
		getAntiAfkControlState,
		setSentinelModeEnabled,
		sentinelModeEnabled,
	} from "$lib/stores/sentinelModeStore";
	import { gameServerRevision } from "$lib/stores/gameServersStore"
	import {
		quickActionTagItems,
		resolveQuickActionMessage,
		type QuickActionMessageContext,
		type QuickActionMessageKind,
	} from "$lib/utils/quickActions";
	import { fetchActiveServerProfile } from "$lib/utils/serverProfilesApi";
	import {
		bindModalToOverlayVisibility,
		ModalStateCoordinator,
		nextQuickActionMessageKind,
	} from "$lib/utils/quickActionUi";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import QuickActionModal from "./QuickActionModal.svelte";

	export let serverExternalId: string | null;
	export let serverName: string;
	export let user: UserSession;

	let messageKind: QuickActionMessageKind | null = null;
	let draft = ``;
	let sending = false;
	let antiAfkEnabled = false
	let antiAfkChanging = false
	let activeProfile: ActiveServerProfile | null = null;
	let composerVersion = 0;
	let loadedGameServerRevision = -1
	let returnFocus: HTMLButtonElement | null = null;
	let quickActionsRoot: HTMLElement;
	const modalState = new ModalStateCoordinator((open) =>
		getOverlayApi().setModalOpen(open),
	);

	$: gameServer = activeProfile?.gameServer;
	$: messageContext = {
		admin: user.displayName.trim() || user.username,
		serverName:
			gameServer?.displayName?.trim() || gameServer?.name || serverName,
		clanName: gameServer?.clanName ?? ``,
		clanTag: gameServer?.clanTag ?? ``,
		variables: activeProfile?.variables ?? [],
	} satisfies QuickActionMessageContext;
	$: tags = quickActionTagItems(
		activeProfile?.profile.availableVariables ?? [],
		activeProfile?.variables ?? [],
		messageContext
	)
	$: resolvedMessage = resolveQuickActionMessage(draft, messageContext, messageKind);
	$: antiAfkControl = getAntiAfkControlState($sentinelModeEnabled, antiAfkChanging)
	$: if (messageKind && loadedGameServerRevision !== $gameServerRevision) {
		loadedGameServerRevision = $gameServerRevision
		void loadActiveProfile(++composerVersion)
	}

	onMount(() => {
		void loadAntiAfkState()
		window.addEventListener(`keydown`, handleKeydown);
		const unsubscribeVisibility = bindModalToOverlayVisibility(
			getOverlayApi().onVisibilityChange,
			closeComposer,
		);
		return () => {
			window.removeEventListener(`keydown`, handleKeydown);
			unsubscribeVisibility();
		};
	});

	onDestroy(() => void closeComposer());

	async function openComposer(
		kind: QuickActionMessageKind,
		trigger: HTMLButtonElement,
	): Promise<void> {
		const version = ++composerVersion;
		draft = ``;
		activeProfile = null;
		returnFocus = trigger;

		try {
			await modalState.set(true);
		} catch (error) {
			if (version === composerVersion) {
				notifyError(
					error instanceof Error ? error.message : `Message composer failed.`,
				);
			}
			return;
		}

		if (version !== composerVersion) return;

		loadedGameServerRevision = $gameServerRevision
		messageKind = kind;
		await loadActiveProfile(version)
	}

	async function loadActiveProfile(version: number): Promise<void> {
		try {
			const profile = await fetchActiveServerProfile(serverExternalId)
			if (version === composerVersion) activeProfile = profile
		} catch (error) {
			if (version !== composerVersion) return
			notifyError(error instanceof Error ? error.message : `Active profile request failed.`)
		}
	}

	async function closeComposer(): Promise<void> {
		composerVersion += 1;
		messageKind = null;
		draft = ``;
		sending = false;
		activeProfile = null;
		loadedGameServerRevision = -1
		await modalState.set(false).catch(() => undefined);
	}

	function toggleComposer(
		kind: QuickActionMessageKind,
		trigger: HTMLButtonElement,
	): void {
		const nextKind = nextQuickActionMessageKind(messageKind, kind);
		if (!nextKind) {
			void closeComposer();
			return;
		}

		void openComposer(nextKind, trigger);
	}

	async function sendMessage(): Promise<void> {
		if (!messageKind || !draft.trim() || sending) return;

		const version = composerVersion;
		const kind = messageKind;
		const resolved = resolveQuickActionMessage(draft, messageContext, kind);
		sending = true;

		try {
			const result = await getCoreApi().message(kind, resolved);
			if (!result.ok || extractEnvelope<unknown>(result)?.ok === false) {
				throw new Error(getCoreErrorMessage(result, `Message failed.`));
			}
			if (version !== composerVersion) return;

			await closeComposer();
			notifySuccess(kind === `admin` ? `Adminsay sent.` : `Serversay sent.`);
		} catch (error) {
			if (version !== composerVersion) return;
			notifyError(error instanceof Error ? error.message : `Message failed.`);
		} finally {
			if (version === composerVersion) sending = false;
		}
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== `Escape` || !messageKind) return;
		event.preventDefault();
		void closeComposer();
	}

	async function toggleSentinelMode(): Promise<void> {
		antiAfkChanging = true
		try {
			const state = await setSentinelModeEnabled(!$sentinelModeEnabled)
			if (state.enabled) antiAfkEnabled = false
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : `Sentinel Mode toggle failed.`,
			)
		} finally {
			antiAfkChanging = false
		}
	}

	async function loadAntiAfkState(): Promise<void> {
		try {
			antiAfkEnabled = (await getCoreApi().antiAfkState()).enabled
		} catch {
			antiAfkEnabled = false
		}
	}

	async function toggleAntiAfk(): Promise<void> {
		if (antiAfkChanging || $sentinelModeEnabled) return

		antiAfkChanging = true
		try {
			antiAfkEnabled = (
				await getCoreApi().setAntiAfkEnabled(!antiAfkEnabled)
			).enabled
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : `Anti-AFK toggle failed.`,
			)
		} finally {
			antiAfkChanging = false
		}
	}
</script>

<section
	class="quick-actions"
	aria-label="Quick Actions"
	bind:this={quickActionsRoot}
>
	<button
		class:quick-actions__button--active={messageKind === `admin`}
		type="button"
		aria-pressed={messageKind === `admin`}
		use:tooltipAction={`Say something as you with red text.`}
		on:click={(event) => toggleComposer(`admin`, event.currentTarget)}
		>Adminsay</button
	>
	<button
		class:quick-actions__button--active={messageKind === `server`}
		type="button"
		aria-pressed={messageKind === `server`}
		use:tooltipAction={`Say something as server in yellow text.`}
		on:click={(event) => toggleComposer(`server`, event.currentTarget)}
		>Serversay</button
	>
	<button
		class:quick-actions__button--active={antiAfkEnabled}
		type="button"
		aria-pressed={antiAfkEnabled}
		disabled={antiAfkControl.disabled}
		use:tooltipAction={antiAfkControl.tooltip}
		on:click={() => void toggleAntiAfk()}
	>
		Anti-AFK
	</button>
	<button
		class="quick-actions__sentinel"
		class:quick-actions__sentinel--active={$sentinelModeEnabled}
		type="button"
		aria-pressed={$sentinelModeEnabled}
		use:tooltipAction={`Constant surveillance, may cause lag.`}
		on:click={() => void toggleSentinelMode()}
	>
		SENTINEL MODE <small>WIP</small>
	</button>
</section>

{#if messageKind}
	<QuickActionModal
		kind={messageKind}
		{draft}
		{resolvedMessage}
		{tags}
		{sending}
		{returnFocus}
		{quickActionsRoot}
		onDraftChange={(value) => (draft = value)}
		onSend={() => void sendMessage()}
		onCancel={() => void closeComposer()}
	/>
{/if}

<style lang="scss">
	.quick-actions {
		position: fixed;
		top: calc(var(--gutter-lg) + 2px);
		left: 50%;
		z-index: 36;
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		padding: 6px;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		background: rgba(5, 13, 21, 0.86);
		transform: translateX(calc(-50% + var(--quick-actions-offset-x)));
		transition: transform var(--sidebar-motion-duration) var(--motion-ease);
	}

	.quick-actions button {
		min-height: var(--control-height-sm);
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		color: var(--color-light-secondary);
		background: rgba(21, 40, 55, 0.52);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}

	.quick-actions button:hover,
	.quick-actions button:focus-visible {
		color: var(--color-light-primary);
	}

	.quick-actions .quick-actions__button--active {
		border-color: var(--color-accent-primary);
		color: var(--color-light-primary);
		background: rgba(156, 95, 255, 0.18);
	}

	.quick-actions__sentinel small {
		margin-left: 5px;
		color: var(--color-accent-tertiary);
		font-size: 9px;
	}

	.quick-actions .quick-actions__sentinel--active {
		border-color: var(--color-accent-secondary);
	}
</style>
