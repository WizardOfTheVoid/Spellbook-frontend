<script lang="ts">
	import { actionExecutionIssue } from "@spellbook/shared/actions/actionExecutionAccess";
	import {
		usesServerMessageFacts,
		type MessageFacts,
	} from "@spellbook/shared/actions/messageFacts";
	import { actionsApi } from "$lib/utils/actionsApi";
	import { tagTypes } from "$lib/components/messages/tagTypesStore";
	import { messageLegendItems } from "$lib/components/messages/messageLegend";
	import { contextualMessageKeys } from "@spellbook/shared/actions/tagTypeDefinitions.js";
	import { getAdminName } from "@spellbook/shared/adminName.js";

	import { consoleSetup } from "$lib/consoleSetup/consoleSetupStore";
	import { currentServer } from "$lib/gameState/currentServerStore";
	import { gameState } from "$lib/gameState/gameStateStore";
	import { isInGameServer } from "../../../../../shared/gameState";
	import { activeProfileVariables } from "$lib/utils/activeProfiles";
	import { onDestroy, onMount } from "svelte";
	import {
		extractEnvelope,
		getCoreApi,
		getCoreErrorMessage,
		getOverlayApi,
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
	import {
		quickActionTagItems,
		resolveQuickActionMessage,
		type QuickActionMessageContext,
		type QuickActionMessageKind,
	} from "$lib/utils/quickActions";
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
	let facts: MessageFacts = {};
	let now = new Date().toISOString();
	let draft = ``;
	let sending = false;
	let antiAfkEnabled = false;
	let antiAfkChanging = false;
	let composerVersion = 0;
	let composerServerId: string | null = null;
	let returnFocus: HTMLButtonElement | null = null;
	let quickActionsRoot: HTMLElement;
	const modalState = new ModalStateCoordinator((open) =>
		getOverlayApi().setModalOpen(open),
	);

	$: inGameServer = isInGameServer($gameState);
	$: blocked = $consoleSetup.commandsBlocked || !inGameServer;
	$: blockedReason =
		!inGameServer ?
			`Join a game server to use quick actions.`
		:	($consoleSetup.commandIssue ?? ``);
	$: activeProfile = $currentServer.activeProfile;
	$: executionIssue = actionExecutionIssue(activeProfile);
	$: messageBlocked = blocked || Boolean(executionIssue);
	$: messageBlockedReason = blockedReason || executionIssue || ``;
	$: if (
		composerServerId !== null &&
		(messageBlocked || composerServerId !== serverExternalId)
	)
		void closeComposer();
	$: gameServer = activeProfile?.gameServer;
	$: messageContext = {
		...facts,
		now,
		tagDefinitions: $tagTypes,
		admin: getAdminName(user),
		serverName:
			gameServer?.displayName?.trim() || gameServer?.name || serverName,
		serverSlot: gameServer?.maxPlayers,
		clanName: gameServer?.clanName ?? ``,
		clanTag: gameServer?.clanTag ?? ``,
		variables: activeProfile?.variables ?? [],
	} satisfies QuickActionMessageContext;
	$: variableTags = quickActionTagItems(
		activeProfileVariables(activeProfile),
		activeProfile?.variables ?? [],
		messageContext,
	);
	$: tags = [
		...messageLegendItems($tagTypes, messageContext, {
			player: false,
			authoring: false,
		}),
		...variableTags
			.filter((item) => !contextualMessageKeys.has(item.tag.slice(1, -1)))
			.map((item) => ({
				...item,
				group: `Variables`,
				example: resolveQuickActionMessage(item.tag, messageContext),
			})),
	];
	$: resolvedMessage = resolveQuickActionMessage(
		draft,
		messageContext,
		messageKind,
	);
	$: antiAfkControl = getAntiAfkControlState(
		$sentinelModeEnabled,
		antiAfkChanging,
	);

	onMount(() => {
		void loadAntiAfkState();
		const clock = setInterval(() => {
			if (messageKind) now = new Date().toISOString();
		}, 1000);
		window.addEventListener(`keydown`, handleKeydown);
		const unsubscribeVisibility = bindModalToOverlayVisibility(
			getOverlayApi().onVisibilityChange,
			closeComposer,
		);
		return () => {
			clearInterval(clock);
			window.removeEventListener(`keydown`, handleKeydown);
			unsubscribeVisibility();
		};
	});

	onDestroy(() => void closeComposer());

	async function openComposer(
		kind: QuickActionMessageKind,
		trigger: HTMLButtonElement,
	): Promise<void> {
		if (messageBlocked || !serverExternalId) return;
		const version = ++composerVersion;
		draft = ``;
		composerServerId = serverExternalId;
		returnFocus = trigger;

		try {
			await tagTypes.load();
			const currentFacts =
				gameServer?.id ?
					await actionsApi<MessageFacts>(`messageFacts`, { id: gameServer.id })
				:	{};
			if (version !== composerVersion) return;
			facts = currentFacts;
			now = new Date().toISOString();
			if (
				version !== composerVersion ||
				messageBlocked ||
				composerServerId !== serverExternalId
			)
				return;
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
		if (messageBlocked || composerServerId !== serverExternalId) {
			await closeComposer();
			return;
		}

		messageKind = kind;
	}

	async function closeComposer(): Promise<void> {
		composerVersion += 1;
		messageKind = null;
		draft = ``;
		sending = false;
		composerServerId = null;
		await modalState.set(false).catch(() => undefined);
	}

	function toggleComposer(
		kind: QuickActionMessageKind,
		trigger: HTMLButtonElement,
	): void {
		if (messageBlocked) return;
		const nextKind = nextQuickActionMessageKind(messageKind, kind);
		if (!nextKind) {
			void closeComposer();
			return;
		}

		void openComposer(nextKind, trigger);
	}

	async function sendMessage(): Promise<void> {
		if (
			messageBlocked ||
			composerServerId !== serverExternalId ||
			!messageKind ||
			!draft.trim() ||
			sending
		)
			return;

		const version = composerVersion;
		const kind = messageKind;

		sending = true;

		try {
			if (gameServer?.id && usesServerMessageFacts([{ message: draft }])) {
				facts = await actionsApi<MessageFacts>(`messageFacts`, {
					id: gameServer.id,
				});
			}
			if (
				version !== composerVersion ||
				messageBlocked ||
				composerServerId !== serverExternalId
			)
				return;
			const resolved = resolveQuickActionMessage(
				draft,
				{ ...messageContext, ...facts, now: new Date().toISOString() },
				kind,
			);
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
		if (blocked) return;
		antiAfkChanging = true;
		try {
			const state = await setSentinelModeEnabled(!$sentinelModeEnabled);
			if (state.enabled) antiAfkEnabled = false;
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : `Sentinel Mode toggle failed.`,
			);
		} finally {
			antiAfkChanging = false;
		}
	}

	async function loadAntiAfkState(): Promise<void> {
		try {
			antiAfkEnabled = (await getCoreApi().antiAfkState()).enabled;
		} catch {
			antiAfkEnabled = false;
		}
	}

	async function toggleAntiAfk(): Promise<void> {
		if (blocked || antiAfkChanging || $sentinelModeEnabled) return;

		antiAfkChanging = true;
		try {
			antiAfkEnabled = (await getCoreApi().setAntiAfkEnabled(!antiAfkEnabled))
				.enabled;
		} catch (error) {
			notifyError(
				error instanceof Error ? error.message : `Anti-AFK toggle failed.`,
			);
		} finally {
			antiAfkChanging = false;
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
		disabled={messageBlocked}
		use:tooltipAction={messageBlocked ? messageBlockedReason : (
			`Say something as you with red text.`
		)}
		on:click={(event) => toggleComposer(`admin`, event.currentTarget)}
		>Adminsay</button
	>
	<button
		class:quick-actions__button--active={messageKind === `server`}
		type="button"
		aria-pressed={messageKind === `server`}
		disabled={messageBlocked}
		use:tooltipAction={messageBlocked ? messageBlockedReason : (
			`Say something as server in yellow text.`
		)}
		on:click={(event) => toggleComposer(`server`, event.currentTarget)}
		>Serversay</button
	>
	<button
		class:quick-actions__button--active={antiAfkEnabled}
		type="button"
		aria-pressed={antiAfkEnabled}
		disabled={blocked || antiAfkControl.disabled}
		use:tooltipAction={blocked ? blockedReason : antiAfkControl.tooltip}
		on:click={() => void toggleAntiAfk()}
	>
		Anti-AFK
	</button>
	<button
		class="quick-actions__sentinel"
		class:quick-actions__sentinel--active={$sentinelModeEnabled}
		type="button"
		aria-pressed={$sentinelModeEnabled}
		disabled={blocked}
		use:tooltipAction={blocked ? blockedReason : (
			`Constant surveillance, may cause lag.`
		)}
		on:click={() => void toggleSentinelMode()}
	>
		SENTINEL MODE
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
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		border: 1px solid var(--color-dark-secondary);
		background: rgbaa(var(--color-dark-primary), 0.8);
	}

	.quick-actions button {
		--quick-action-accent: var(--color-accent-primary);
		min-height: var(--control-height-sm);
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: rgbaa(var(--color-dark-secondary), 0.2);
		padding: 0 var(--gutter-md);
		color: var(--color-light-secondary);
		background: transparent;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		transition: all var(--motion-fast) var(--motion-ease);
	}

	.quick-actions
		button:is(:hover, :focus-visible):not(:disabled):not(
			[aria-pressed="true"]
		) {
		border-color: var(--color-light-tertiary);
		color: var(--color-light-primary);
		background: rgbaa(var(--color-dark-tertiary), 0.15);
	}

	.quick-actions button:focus-visible {
		outline: 2px solid var(--quick-action-accent);
		outline-offset: 2px;
	}

	.quick-actions .quick-actions__sentinel {
		--quick-action-accent: var(--color-accent-secondary);
	}

	.quick-actions .quick-actions__button--active,
	.quick-actions .quick-actions__sentinel--active {
		border-color: var(--quick-action-accent);
		color: var(--color-light-primary);
		background: rgbaa(var(--quick-action-accent), 0.12);
	}


</style>
