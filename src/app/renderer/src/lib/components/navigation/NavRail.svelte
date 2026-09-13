<script lang="ts">
	import KeybindValue from "$lib/components/ui/KeybindValue.svelte"
	import { navigation, rememberNavigation } from "$lib/navigation/navigation"
	import { onMount } from "svelte"
	import { productVersion } from "@spellbook/shared/productVersion";
	import type { ActivePage } from "$lib/types/ui";
	import { tooltip } from "$lib/utils/tooltip";
	import { getOverlayApi, type UserSession } from "$lib/core";
	import logoUrl from "$lib/resources/logo-plain.svg?url";
	import { infinityMenuState, updateInfinityMenuBadge } from "$lib/components/ui/infinityMenu"
	import CountBadge from "$lib/components/ui/CountBadge.svelte"
	import { pendingTeamRequests } from "$lib/stores/pendingTeamRequests"
	import { celebrateElement } from "$lib/utils/celebrate";
	import { openAccountInfinityMenu } from "./accountInfinityMenu";
	import { createNavigationEntries } from "./navigationEntries";
	import BetaModal from "./BetaModal.svelte";
	import {
		markAutoHelpDisplayed,
		nextAutoHelpView,
		onHelpRequested,
		type AutoHelpView,
		type HelpView,
	} from "./helpNotice"

	export let activePage: ActivePage;
	export let serverDisplayName = "Current game server";
	export let user: UserSession;
	export let notificationCount = 0;
	export let onSelectPage: (page: ActivePage) => void;
	export let onLogout: () => Promise<void>;

	let avatarButton: HTMLButtonElement;
	let betaButton: HTMLButtonElement;
	let betaOpen = false;
	let helpView: HelpView = `welcome`
	let helpReturnFocus: HTMLButtonElement | null = null;
	let automaticHelp: { userId: number, view: AutoHelpView } | null = null
	let helpUserId: number | null = null
	rememberNavigation(`help`, () => ({ betaOpen, helpView }), state => {
		betaOpen = state.betaOpen
		helpView = state.helpView
	}, state => state.betaOpen ? state.helpView : null)
	function openHelp(view: HelpView, trigger: HTMLButtonElement) {
		void navigation.visit(() => {
			helpView = view
			helpReturnFocus = trigger
			betaOpen = true
		})
	}
	async function openAutomaticHelp(): Promise<void> {
		if (!betaButton || betaOpen || automaticHelp || !user.isActive) return
		const userId = user.id
		try {
			if (!await getOverlayApi().isVisible() || betaOpen || automaticHelp || user.id !== userId) return
		} catch {
			return
		}
		const view = nextAutoHelpView(localStorage, userId, productVersion)
		if (!view) return
		automaticHelp = { userId, view }
		openHelp(view, betaButton)
	}
	function markAutomaticHelpDisplayed(): void {
		const notice = automaticHelp
		automaticHelp = null
		if (!notice || notice.userId !== user.id) return
		markAutoHelpDisplayed(localStorage, notice.userId, productVersion, notice.view)
	}
	function closeHelp(): void {
		automaticHelp = null
		void navigation.visit(() => { betaOpen = false })
	}
	$: entries = createNavigationEntries(user.isSuperadmin, notificationCount);
	$: if (user.id !== helpUserId) {
		helpUserId = user.id
		automaticHelp = null
		void openAutomaticHelp()
	}
	$: accountMenuOpen = Boolean(
		avatarButton && $infinityMenuState?.owner === avatarButton,
	);
	$: if (accountMenuOpen) updateInfinityMenuBadge(avatarButton, `My teams`, $pendingTeamRequests)
	onMount(() => {
		const stopHelp = onHelpRequested(view => openHelp(view, betaButton))
		const stopNavigation = window.chivOverlay?.onNavigate?.(destination => {
			if (destination === `help`) {
				openHelp(`welcome`, betaButton)
			} else {
				void navigation.visit(async () => {
					betaOpen = false
					await onSelectPage(destination)
				})
			}
		})
		const stopVisibility = getOverlayApi().onVisibilityChange(visible => {
			if (visible) void openAutomaticHelp()
		})
		void openAutomaticHelp()
		return () => {
			stopHelp()
			stopNavigation?.()
			stopVisibility()
		}
	})
</script>

{#snippet overlayShortcut()}Press <KeybindValue name="overlayKey" /> to toggle overlay{/snippet}

<aside class="nav-rail" aria-label="Primary navigation">
	<div class="content-sidebar-background-1"></div>

	<div class="nav-header">
		<div class="logo" use:tooltip={{ text: `Toggle overlay`, content: overlayShortcut, detailed: false }}><img src={logoUrl} alt="SpellBook" /></div>
		<span class="version">v{productVersion}</span>
	</div>
	<nav class="nav-stack">
		{#each entries as entry (entry.page)}
			<button
				class:active={activePage === entry.page}
				type="button"
				aria-label={entry.label}
				use:tooltip={entry.page === "server" ? serverDisplayName : entry.label}
				data-uisfx="select"
				data-uisfx-hover="hover"
				on:click={() => onSelectPage(entry.page)}
			>
				<i class={`fa-solid ${entry.icon}`} aria-hidden="true"></i>
				<CountBadge count={entry.badge ?? 0} floating />
			</button>
		{/each}
	</nav>

	<div class="nav-footer">
		<button
			bind:this={avatarButton}
			class="avatar-button"
			class:active={accountMenuOpen ||
				activePage === "account" ||
				activePage === "settings" ||
				activePage === "teams"}
			type="button"
			aria-label={$pendingTeamRequests ? `Account menu, ${$pendingTeamRequests} pending team join requests` : `Account menu`}
			aria-expanded={accountMenuOpen}
			data-uisfx={accountMenuOpen ? "close" : "open"}
			data-uisfx-hover="hover"
			on:click={(event) =>
				openAccountInfinityMenu(event, {
					user,
					pendingRequestCount: $pendingTeamRequests,
					onSelectPage,
					onLogout,
					onHelp: (view) => {
						openHelp(view, avatarButton)
					},
				})}
		>
			{#if user.avatarUrl}<img src={user.avatarUrl} alt="" />{:else}<i
					class="fa-solid fa-user"
					></i>{/if}
			<CountBadge count={$pendingTeamRequests} floating />
		</button>
		<button
			bind:this={betaButton}
			type="button"
			aria-label="Welcome and help"
			aria-haspopup="dialog"
			aria-expanded={betaOpen}
			use:tooltip={`Welcome and help`}
			data-uisfx="select"
			data-uisfx-hover="hover"
			class="beta-button"
			on:click={() => {
				celebrateElement(betaButton);
				openHelp(`welcome`, betaButton)
			}}><i class="fa-solid fa-bug" aria-hidden="true"></i></button
		>
	</div>
</aside>

{#if betaOpen}
	<BetaModal
		bind:view={helpView}
		{onSelectPage}
		returnFocus={helpReturnFocus}
		onDisplayed={markAutomaticHelpDisplayed}
		onClose={closeHelp}
	/>
{/if}

<style lang="scss">
	.logo,
	.version {
		text-align: center;
		width: 100%;
		display: flex;
		justify-content: center;
		align-items: center;
	}
	.logo {
		margin-bottom: var(--gutter-md);
	}
	.logo img {
		width: 42px;
		height: 42px;
		object-fit: contain;
	}
	.version {
		font-size: var(--font-size-xs);
		color: var(--color-light-tertiary);
		font-weight: var(--font-weight-medium);
		text-transform: uppercase;
	}

	.nav-rail {
		position: relative;
		z-index: 2;
		width: var(--nav-width, 78px);
		min-height: 0;
		display: grid;
		grid-template-rows: auto 1fr auto;
		justify-items: center;
		border-radius: var(--radius-xl);
		background: var(--color-dark-primary);
		padding: var(--gutter-lg) 0;
		box-shadow: 0 0 90px rgbaa(var(--color-dark-primary), 0.5);
	}

	button {
		--size: 50px;

		position: relative;
		width: var(--size);
		height: var(--size);
		display: grid;
		place-items: center;
		border-radius: 9999px;
		background: transparent;
		font-size: var(--font-size-lg);

		border: 1px solid var(--color-dark-secondary);
		color: var(--color-light-secondary);

		transition: 0ms var(--motion-ease);

		&:hover {
			border-color: var(--color-dark-tertiary);
			color: var(--color-light-primary);
		}

		&:active {
			border-color: rgbaa(var(--color-light-tertiary), 0.5);
			background-color: rgbaa(var(--color-light-tertiary), 0.05);
			color: var(--white);
		}

		&.active {
			border-color: var(--color-accent-primary);
			color: var(--color-accent-primary);
			box-shadow: 0 0 60px 0px rgbaa(var(--color-accent-primary), 0.3);
			transition: var(--motion-fast) var(--motion-ease);
		}

		&.beta-button {
			&:after {
				content: "";
				position: absolute;
				inset: 0;
				border-radius: inherit;
				box-shadow: 0 0 90px 0px rgbaa(var(--color-accent-primary), 0.65);
				animation: pulse 2500ms infinite;
			}
		}
	}

	.nav-stack {
		align-self: center;
		width: 100%;
		display: grid;
		justify-items: center;
		gap: var(--gutter-md);
	}

	.nav-footer {
		position: relative;
		z-index: 3;
		display: grid;
		gap: var(--gutter-sm);
	}
	.avatar-button {
		position: relative;
		overflow: visible;
		border-radius: 50%;
	}

	.avatar-button img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: inherit;
	}

	.content-sidebar-background-1 {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;

		background: linear-gradient(
			-215deg,
			rgbaa(var(--color-dark-secondary), 1) 0%,
			rgbaa(var(--color-dark-secondary), 0) 75%
		);
		opacity: 0.35;

		mix-blend-mode: lighten;
		user-select: none;
		pointer-events: none;
	}

	@keyframes pulse {
		0% {
			opacity: 1;
		}
		50% {
			opacity: 0;
		}
		100% {
			opacity: 1;
		}
	}
</style>
