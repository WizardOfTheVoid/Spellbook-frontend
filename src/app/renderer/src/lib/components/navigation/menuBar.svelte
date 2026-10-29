<script lang="ts">
	import { onMount, tick } from "svelte";
	import AppUpdateNotice from '$lib/appUpdates/appUpdateNotice.svelte'
	import { dev } from "$app/environment"
	import type { ProfileOwner, TeamListRecord } from "$lib/core";
	import {
		canReadTeam,
		type CurrentTeamState,
	} from "$lib/teams/currentTeamStore";
	import type {
		TeamNavigationTarget,
		TeamPanelLocation,
		TeamPanelTarget,
	} from "$lib/teams/teamNavigation";
	import { createTeamMenuState } from "./teamMenuState";
	import { menuItemCount, type MenuCountSource } from "./menuItemCount";
	import { getAdminName } from "@spellbook/shared/adminName.js";
	import { productVersion } from "@spellbook/shared/productVersion";
	import { getOverlayApi, type UserSession } from "$lib/core";
	import type { ActivePage } from "$lib/types/ui";
	import { navigation, rememberNavigation } from "$lib/navigation/navigation";
	import { gameState } from "$lib/gameState/gameStateStore";
	import { isInGameServer } from "../../../../../shared/gameState";
	import { pendingTeamRequests } from "$lib/stores/pendingTeamRequests";
	import { actionEventsPendingCount } from '$lib/components/actionEvents/actionEventsPendingCount'
	import { tooltip, type TooltipConfig } from "$lib/utils/tooltip";
	import { celebrateElement } from "$lib/utils/celebrate";
	import logoUrl from "$lib/resources/logo-plain.svg?url";
	import KeybindValue from "$lib/components/ui/KeybindValue.svelte";
	import CountBadge from "$lib/components/ui/CountBadge.svelte";
	import AvatarTeam from '$lib/components/ui/avatars/avatarTeam.svelte'
	import AvatarUser from '$lib/components/ui/avatars/avatarUser.svelte'
	import {
		closeInfinityMenu,
		infinityMenuState,
	} from "$lib/components/ui/infinityMenu";
	import { openCredits } from "$lib/components/credits/credits";
	import { openAccountInfinityMenu } from "./accountInfinityMenu";
	import HelpModal from "./helpModal.svelte";
	import {
		markAutoHelpDisplayed,
		nextAutoHelpView,
		onHelpRequested,
		type AutoHelpView,
		type HelpView,
	} from "./helpNotice";

	$: links = {
		notification: {
			page: `notifications`,
			label: `Notifications`,
			tooltip: `Notifications`,
			icon: `fa-bell`,
			badge: `notifications`,
		},
		sections: [
			{
				id: "moderation",
				label: "Moderation",
				items: [
					{
						page: "server",
						label: "Game Server",
						icon: "fa-gamepad",
						status: "inServer",
						tooltip: { text: serverDisplayName },
					},
					{ page: `actionRequests`, label: `Action Events`, icon: `fa-list-check`, badge: `actionEvents`, countVariant: `muted` },
					{ page: `playerForensics`, label: `Player Forensics`, icon: `fa-fingerprint`, superadminOnly: true },
					{ page: "wanted", label: "Wanted", icon: "fa-crosshairs" },
					{ page: "profiles", label: "Profiles", icon: "fa-layer-group" },
				],
			},
			{
				id: "community",
				label: "Community",
				items: [
					{ page: "dashboard", label: "Dashboard", icon: "fa-chart-line" },
					{ page: "players", label: "All players", icon: "fa-users" },
					{ page: "servers", label: "Server browser", icon: "fa-server" },
				],
			},
			{
				id: "spellbook",
				label: `SpellBook // ${getAdminName(user)}`,
				items: [
					{ page: "settings", label: "Settings", icon: "fa-gear" },
					{
						action: `help`,
						label: `Help`,
						icon: `fa-circle-question`,
						trailingIcon: `fa-arrow-up-right-from-square`,
					},
				],
			},
			{
				id: `my-teams`,
				label: `My Teams`,
				action: { label: `See all`, page: `teams` },
				source: `teams`,
				items: [],
				tooltip: (team) =>
					canReadTeam(team) ? `` : `Team read permission is required`,
			},
		],
		team: [
			{ target: `members`, label: `Members`, icon: `fa-users` },
			{ target: `guidelines`, label: `Guidelines`, icon: `fa-book` },
			{ target: `profiles`, label: `Profiles`, icon: `fa-layer-group` },
			{
				target: `requests`,
				label: `Join requests`,
				icon: `fa-user-clock`,
				adminOnly: true,
				badge: `teamRequests`,
			},
			{ target: `settings`, label: `Settings`, icon: `fa-gear` },
		],
	} satisfies MenuLinks;

	type MenuItem = {
		label: string;
		tooltip?: TooltipConfig;
		icon: string;
		trailingIcon?: string;
		badge?: MenuCountSource;
		count?: number;
		countVariant?: `alert` | `muted`
		status?: `inServer`;
		superadminOnly?: boolean;
	} & ({ page: ActivePage; action?: never } | { action: `help`; page?: never });

	type TeamMenuItem = {
		target: `profiles` | TeamPanelTarget;
		label: string;
		tooltip?: TooltipConfig;
		icon: string;
		adminOnly?: boolean;
		badge?: MenuCountSource;
		count?: number;
	};
	type MenuSection = {
		id: string;
		label: string;
		items: MenuItem[];
		source?: `teams`;
		tooltip?: (team: TeamListRecord) => TooltipConfig;
		action?: { label: string; page: ActivePage; tooltip?: TooltipConfig };
	};
	type MenuLinks = {
		notification: MenuItem & { page: ActivePage };
		sections: MenuSection[];
		team: TeamMenuItem[];
	};

	export let activePage: ActivePage;
	export let serverDisplayName = `Current game server`;
	export let user: UserSession;
	export let notificationCount = 0;
	export let onSelectPage: (page: ActivePage) => void | Promise<boolean>;
	export let onLogout: () => Promise<void>;
	export let onHideOverlay: () => Promise<void> = async () => { await getOverlayApi().hide() }
	export let currentTeam: TeamListRecord | null = null;
	export let teamState: CurrentTeamState = {
		userId: null,
		teams: [],
		currentTeamId: null,
		selectionRevision: 0,
		loading: false,
		error: null,
	};
	export let selectedOwner: ProfileOwner | null = null;
	export let teamLocation: TeamPanelLocation = {
		teamId: null,
		teamView: `members`,
	};
	export let contentTeamId: number | null = null;
	export let onSelectTeam: (teamId: number) => boolean = () => false;
	export let onRefreshTeams: () => Promise<void> = async () => {};
	export let onTeamDestination: (
		target: TeamNavigationTarget,
	) => Promise<boolean> = async () => false;
	const menu = createTeamMenuState(teamState.selectionRevision);
	let mainNav: HTMLElement;
	let teamNav: HTMLElement;
	let teamBackButton: HTMLButtonElement;
	let menuUserId: number | null = null;
	let scrollTeamId: number | null = null;
	const teamScroll = new Map<number, number>();

	let avatarButton: HTMLButtonElement;
	let helpButton: HTMLButtonElement;
	let helpOpen = false;
	let helpView: HelpView = `welcome`;
	let helpReturnFocus: HTMLButtonElement | null = null;
	let automaticHelp: { userId: number; view: AutoHelpView } | null = null;
	let helpUserId: number | null = null;

	$: sections = links.sections
		.map<MenuSection>((section) => ({
			...section,
			items: section.items
				.filter((entry: MenuItem) => !entry.superadminOnly || user.isSuperadmin)
				.map((entry: MenuItem) => ({
					...entry,
					count: menuItemCount(entry.badge, badges, entry.count),
				})),
		}))
		.filter((section) => section.items.length || section.source);
	$: teamEntries = (links.team as TeamMenuItem[])
		.filter(
			(entry) => !entry.adminOnly || currentTeam?.permissions.includes(`admin`),
		)
		.map((entry) => ({
			...entry,
			count: menuItemCount(entry.badge, {
				...badges,
				teamRequests: currentTeam?.pendingRequestCount ?? 0,
			}),
		}));
	$: void restoreActionFocus(teamEntries);
	$: if (menuUserId !== user.id) {
		menuUserId = user.id;
		void backToMain(false);
		teamScroll.clear();
	}
	$: if (!currentTeam && $menu === `team`) void backToMain(false);
	$: if (menu.syncSelection(teamState.selectionRevision, currentTeam !== null))
		void focusTeamMenu();
	$: if (menu.syncContent(contentTeamId, currentTeam?.id ?? null))
		void backToMain(false);
	$: void restoreTeamScroll(currentTeam?.id ?? null);
	$: badges = {
		actionEvents: menuItemCount(`actionEvents`, { actionEvents: $actionEventsPendingCount ?? undefined }),
		notifications: menuItemCount(`notifications`, {
			notifications: notificationCount,
		}),
		teamRequests: menuItemCount(`teamRequests`, {
			teamRequests: $pendingTeamRequests,
		}),
	};
	$: actionEventsPendingCount.syncUser(user.id, user.isSuperadmin)
	$: inServer = isInGameServer($gameState);
	$: accountMenuOpen = Boolean(
		avatarButton && $infinityMenuState?.owner === avatarButton,
	);
	$: if (user.id !== helpUserId) {
		helpUserId = user.id;
		automaticHelp = null;
		helpOpen = false;
		if (accountMenuOpen) closeInfinityMenu();
		void openAutomaticHelp();
	}

	rememberNavigation(
		`help`,
		() => ({ helpOpen, helpView }),
		(state) => {
			helpOpen = state.helpOpen;
			helpView = state.helpView;
		},
		(state) => (state.helpOpen ? state.helpView : null),
	);

	async function focusTeamMenu() {
		await tick();
		if ($menu === `team`) teamBackButton?.focus({ preventScroll: true });
	}

	async function enterTeam(teamId: number) {
		const userId = user.id;
		if (!onSelectTeam(teamId)) return;
		await tick();
		if (user.id !== userId || currentTeam?.id !== teamId) return;
		menu.openTeam();
		await tick();
		if (user.id !== userId || currentTeam?.id !== teamId) return;
		teamBackButton?.focus({ preventScroll: true });
		await onTeamDestination({ page: `teams`, teamId, teamView: `members` });
	}

	async function backToMain(refresh = true) {
		const teamId = currentTeam?.id;
		const restoreFocus = refresh || teamNav?.contains(document.activeElement);
		menu.back();
		await tick();
		if (restoreFocus)
			(
				mainNav?.querySelector<HTMLButtonElement>(
					`[data-team-id="${teamId}"]`,
				) ?? mainNav
			)?.focus({ preventScroll: true });
		if (refresh) void onRefreshTeams();
	}

	async function restoreActionFocus(entries: TeamMenuItem[]) {
		if (typeof document === `undefined`) return;
		const focused =
			document.activeElement instanceof HTMLElement ?
				document.activeElement.dataset.teamDestination
			:	undefined;
		if (!focused || entries.some((entry) => entry.target === focused)) return;
		await tick();
		if ($menu === `team`) teamBackButton?.focus({ preventScroll: true });
	}

	async function restoreTeamScroll(teamId: number | null) {
		if (teamId === scrollTeamId) return;
		if (scrollTeamId !== null && teamNav)
			teamScroll.set(scrollTeamId, teamNav.scrollTop);
		scrollTeamId = teamId;
		await tick();
		if (teamNav && scrollTeamId === teamId)
			teamNav.scrollTop = teamId === null ? 0 : (teamScroll.get(teamId) ?? 0);
	}

	function teamEntryActive(entry: TeamMenuItem) {
		if (!currentTeam) return false;
		if (entry.target === `profiles`)
			return (
				activePage === `profiles` &&
				selectedOwner?.type === `team` &&
				selectedOwner.id === currentTeam.id
			);
		return (
			activePage === `teams` &&
			teamLocation.teamId === currentTeam.id &&
			(teamLocation.teamView === entry.target ||
				(entry.target === `settings` && teamLocation.teamView === `servers`))
		);
	}

	async function selectTeamEntry(entry: TeamMenuItem) {
		const team = currentTeam;
		if (
			!team ||
			!canReadTeam(team) ||
			(entry.adminOnly && !team.permissions.includes(`admin`))
		)
			return;
		await onTeamDestination(
			entry.target === `profiles` ?
				{ page: `profiles`, teamId: team.id }
			:	{ page: `teams`, teamId: team.id, teamView: entry.target },
		);
	}

	function openHelp(
		view: HelpView,
		trigger: HTMLButtonElement | null = null,
	): void {
		void navigation.visit(() => {
			helpView = view;
			helpReturnFocus =
				$menu === `team` ? avatarButton : (trigger ?? avatarButton);
			helpOpen = true;
		});
	}

	async function openAutomaticHelp(): Promise<void> {
		if (!helpButton || helpOpen || automaticHelp || !user.isActive) return;
		const userId = user.id;
		try {
			if (
				!(await getOverlayApi().isVisible()) ||
				helpOpen ||
				automaticHelp ||
				user.id !== userId
			)
				return;
		} catch {
			return;
		}
		const view = nextAutoHelpView(localStorage, userId, productVersion);
		if (!view) return;
		automaticHelp = { userId, view };
		openHelp(view, helpButton);
	}

	function markAutomaticHelpDisplayed(): void {
		const notice = automaticHelp;
		automaticHelp = null;
		if (!notice || notice.userId !== user.id) return;
		markAutoHelpDisplayed(
			localStorage,
			notice.userId,
			productVersion,
			notice.view,
		);
	}

	function closeHelp(): void {
		automaticHelp = null;
		void navigation.visit(() => {
			helpOpen = false;
		});
	}

	onMount(() => {
		let visible = false
		async function initialVisibility(): Promise<void> {
			try { visible = await getOverlayApi().isVisible() } catch {}
		}
		void initialVisibility()
		const pendingTimer = window.setInterval(() => {
			if (visible && !document.hidden) void actionEventsPendingCount.refresh()
		}, 5000)
		const stopHelp = onHelpRequested((view) => openHelp(view, helpButton));
		const stopNavigation = window.chivOverlay?.onNavigate?.((destination) => {
			if (destination === `help`) openHelp(`welcome`, helpButton);
			else
				void navigation.visit(async () => {
					helpOpen = false;
					await onSelectPage(destination);
				});
		});
		const stopVisibility = window.chivOverlay?.onVisibilityChange((nextVisible) => {
			visible = nextVisible
			if (visible) {
				void openAutomaticHelp()
				void actionEventsPendingCount.refresh()
			}
		});
		void openAutomaticHelp();
		return () => {
			window.clearInterval(pendingTimer)
			actionEventsPendingCount.syncUser(null)
			stopHelp();
			stopNavigation?.();
			stopVisibility?.();
			if ($infinityMenuState?.owner === avatarButton) closeInfinityMenu();
		};
	});
</script>

{#snippet overlayShortcut()}Press <KeybindValue name="overlayKey" /> to toggle overlay{/snippet}

{#snippet itemContent(entry: MenuItem)}
	<i class={`fa-solid ${entry.icon}`} aria-hidden="true"></i>
	<span class="item-label">{entry.label}</span>
	{#if entry.status === `inServer` && inServer}<span
			class="server-status"
			role="img"
			aria-label="Connected to game server"
		></span>{/if}
	<CountBadge count={entry.count ?? 0} variant={entry.countVariant ?? `alert`}
		label={entry.badge === `actionEvents` && $actionEventsPendingCount !== null ? `${entry.count ?? 0} pending` : null} />
	{#if entry.trailingIcon}<i
			class={`fa-regular ${entry.trailingIcon} item-trailing-icon`}
			aria-hidden="true"
		></i>{/if}
{/snippet}

<aside class="menu-bar" aria-label="Primary navigation">
	<header class="menu-header">
		<div class="wrapper">
			<button
				class="brand brand-symbol"
				type="button"
				aria-label="Hide SpellBook overlay"
				on:click={onHideOverlay}
				use:tooltip={{
					text: `Toggle overlay`,
					content: overlayShortcut,
					detailed: false,
				}}
			>
				<span class="brand-logo" style={`mask-image: url("${logoUrl}")`} aria-hidden="true"></span>
			</button>
			<AppUpdateNotice>
				<button class="brand" type="button" aria-label="Hide SpellBook overlay" on:click={onHideOverlay}>
					<span class="brand-copy">
						<span>SpellBook</span>
						{#if dev}
							<span class="version" use:tooltip={`v${productVersion}`}>DEV</span>
						{:else}
							<span class="version">v{productVersion}</span>
						{/if}
					</span>
				</button>
			</AppUpdateNotice>
			<button
				type="button"
				class="notification-button"
				class:active={activePage === links.notification.page}
				aria-label={badges[links.notification.badge] > 0 ?
					`${links.notification.label}, ${badges[links.notification.badge]} unread`
				:	links.notification.label}
				aria-current={activePage === links.notification.page ?
					`page`
				:	undefined}
				use:tooltip={links.notification.tooltip ?? ``}
				data-uisfx="select"
				data-uisfx-hover="hover"
				on:click={() => onSelectPage(links.notification.page)}
			>
				<i class={`fa-solid ${links.notification.icon}`} aria-hidden="true"></i>
				<CountBadge count={badges[links.notification.badge]} floating />
			</button>
		</div>
	</header>

	<div class="menu-viewport">
		<div class="menu-track" class:show-team={$menu === `team`}>
			<nav
				bind:this={mainNav}
				tabindex="-1"
				aria-label="Main menu"
				inert={$menu !== `main`}
				aria-hidden={$menu !== `main`}
			>
				{#each sections as section (section.id)}
					<section aria-labelledby={`menu-${section.id}`}>
						<div class="menu-section-heading">
							<h2 id={`menu-${section.id}`}>
								{section.label}{#if section.source === `teams`}
									<CountBadge count={badges.teamRequests} />{/if}
							</h2>
							{#if section.action}
								{@const sectionActionActive =
									activePage === section.action.page &&
									(section.action.page !== `teams` || contentTeamId === null)}
								<button
									class="section-action"
									class:active={sectionActionActive}
									type="button"
									aria-current={sectionActionActive ? `page` : undefined}
									use:tooltip={section.action.tooltip ?? ``}
									data-uisfx="select"
									data-uisfx-hover="hover"
									on:click={() =>
										section.action && onSelectPage(section.action.page)}
									>{section.action.label}</button
								>
							{/if}
						</div>
						{#if section.source === `teams`}
							{#if teamState.loading && !teamState.teams.length}<p
									role="status"
								>
									Loading teams…
								</p>{/if}
							{#each teamState.teams as team (team.id)}
								<button
									type="button"
									data-team-id={team.id}
									class:active={contentTeamId === team.id}
									disabled={!canReadTeam(team)}
									aria-label={`Open ${team.name} menu`}
									aria-current={contentTeamId === team.id ? `true` : undefined}
									use:tooltip={section.tooltip?.(team) ?? ``}
									data-uisfx="open"
									data-uisfx-hover="hover"
									on:click={() => void enterTeam(team.id)}
								>
									<span class="team-avatar" aria-hidden="true"
										><AvatarTeam src={team.logo}
											fallbackIcon="fa-users-gear"
											fallbackTone="inherit"
											size="xs"
										/></span
									>
									<span class="item-label">{team.name}</span>
									{#if team.permissions.includes(`admin`)}<CountBadge
											count={menuItemCount(`teamRequests`, {
												teamRequests: team.pendingRequestCount,
											})}
										/>{/if}
									<i
										class="fa-light fa-chevron-right item-trailing-icon"
										aria-hidden="true"
									></i>
								</button>
							{:else}
								{#if !teamState.loading && !teamState.error}<p>
										No teams yet. Open My teams to create or join one.
									</p>{/if}
							{/each}
							{#if teamState.error}<p role="alert">{teamState.error}</p>
								<button type="button" on:click={() => void onRefreshTeams()}
									>Retry teams</button
								>{/if}
						{/if}
						{#each section.items as entry (entry.page ?? entry.action)}
							{#if entry.action === `help`}
								<button
									bind:this={helpButton}
									class:active={helpOpen}
									type="button"
									aria-haspopup="dialog"
									aria-expanded={helpOpen}
									use:tooltip={entry.tooltip ?? ``}
									data-uisfx="select"
									data-uisfx-hover="hover"
									on:click={() => {
										celebrateElement(helpButton);
										openHelp(`welcome`, helpButton);
									}}>{@render itemContent(entry)}</button
								>
							{:else}
								<button
									class:active={activePage === entry.page}
									class:live={entry.status === `inServer` && inServer}
									type="button"
									aria-current={activePage === entry.page ? `page` : undefined}
									use:tooltip={entry.tooltip ?? ``}
									data-uisfx="select"
									data-uisfx-hover="hover"
									on:click={() => onSelectPage(entry.page)}
									>{@render itemContent(entry)}</button
								>
							{/if}
						{/each}
					</section>
				{/each}
			</nav>
			<nav
				bind:this={teamNav}
				aria-label={currentTeam ? `${currentTeam.name} team menu` : `Team menu`}
				inert={$menu !== `team`}
				aria-hidden={$menu !== `team`}
			>
				<section class="team-menu-heading">
					<button
						bind:this={teamBackButton}
						type="button"
						on:click={() => void backToMain()}
						data-uisfx="close"
						data-uisfx-hover="hover"
					>
						<i class="fa-light fa-angle-left item-back-icon" aria-hidden="true"></i><span
							class="item-label">Main menu</span
						>
					</button>
					<h2>{currentTeam?.name ?? `Team`}</h2>
				</section>
				<section aria-label="Team navigation">
					{#each teamEntries as entry (entry.target)}
						<button
							type="button"
							data-team-destination={entry.target}
							class:active={teamEntryActive(entry)}
							aria-current={teamEntryActive(entry) ? `page` : undefined}
							use:tooltip={entry.tooltip ?? ``}
							data-uisfx="select"
							data-uisfx-hover="hover"
							on:click={() => void selectTeamEntry(entry)}
						>
							<i class={`fa-solid ${entry.icon}`} aria-hidden="true"></i><span
								class="item-label">{entry.label}</span
							>
							<CountBadge count={entry.count ?? 0} />
						</button>
					{/each}
				</section>
			</nav>
		</div>
	</div>

	<footer>
		<button
			bind:this={avatarButton}
			class="account-button"
			class:active={accountMenuOpen || activePage === `account`}
			type="button"
			aria-label="Account menu"
			aria-haspopup="menu"
			aria-expanded={accountMenuOpen}
			data-uisfx={accountMenuOpen ? `close` : `open`}
			data-uisfx-hover="hover"
			on:click={(event) =>
				openAccountInfinityMenu(event, {
					user,
					onSelectPage,
					onLogout,
					onCredits: () => openCredits(avatarButton),
					onHelp: (view) => openHelp(view, avatarButton),
				})}
		>
			<AvatarUser src={user.avatarUrl} size={45} class="menu-account-avatar" fallbackType="solid" fallbackTone="inherit" />
			<span class="account-details">
				<span class="account-heading"
					><span class="account-name">{getAdminName(user)}</span><span
						class="tag">{user.isSuperadmin ? `Superadmin` : `Admin`}</span
					></span
				>
				<span class="account-role">Beta supporter</span>
			</span>
			<i class="fa-solid fa-chevron-right account-chevron" aria-hidden="true"
			></i>
		</button>
	</footer>
</aside>

{#if helpOpen}
	<HelpModal
		bind:view={helpView}
		{onSelectPage}
		returnFocus={helpReturnFocus}
		onDisplayed={markAutomaticHelpDisplayed}
		onClose={closeHelp}
		onCredits={async () => {
			await navigation.visit(() => {
				helpOpen = false;
			});
			openCredits(helpReturnFocus);
		}}
	/>
{/if}

<style lang="scss">
	.menu-viewport {
		min-height: 0;
		overflow: hidden;
	}
	.menu-track {
		display: flex;
		width: 200%;
		height: 100%;
		transition: transform 600ms var(--ease);
		&.show-team {
			transform: translateX(-50%);
		}
		> nav {
			flex: 0 0 50%;
			width: 50%;
			height: 100%;
		}
		@media (prefers-reduced-motion: reduce) {
			transition: none;
		}
	}
	.team-menu-heading h2 {
		margin-top: var(--gutter);
		overflow-wrap: anywhere;
	}
	nav button > .item-trailing-icon,
	nav button > .item-back-icon {
		width: auto;
		font-size: var(--font-size-xs);
		color: var(--color-light-tertiary);
		opacity: 0.6;
	}
	nav p {
		padding: 0 12px;
		color: var(--color-light-tertiary);
		font-size: var(--font-size-sm);
	}
	.menu-bar {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		border: 1px solid rgbaa(var(--color-dark-secondary), 0.35);
		background: var(--color-dark-primary);
		background-image: linear-gradient(
			155deg,
			rgbaa(var(--color-dark-secondary), 0.2),
			transparent 60%
		);
		box-shadow: var(--shadow);
		user-select: none;
	}

	// Common padding sizing for top-level sections (header, nav, footer)
	.menu-header,
	nav,
	footer {
		& > * {
			padding: calc(var(--gutter) * 0.75) calc(var(--gutter) * 1);
		}
	}

	// Branding and version
	.menu-header {
		border-bottom: 1px solid rgbaa(var(--color-dark-secondary), 0.5);
		& > .wrapper {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--gutter-sm);
		}
	}
	.brand {
		flex: 0 1 auto;
		width: auto;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: calc(var(--gutter) * 0.5);
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-bold);
		padding: 0;
		border: 0;
		color: var(--color-light-primary);

		.brand-logo {
			flex-shrink: 0;
			width: 32px;
			height: 38px;
			background: var(--white);
			mask-position: center;
			mask-size: contain;
			mask-repeat: no-repeat;
		}
		&:hover,
		&:active,
		&:focus-visible {
			background: transparent;
			.brand-logo { background: var(--color-accent-tertiary); }
		}
	}
	.brand-symbol { flex: 0 0 auto; }
	.brand-copy {
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 6px;
	}
	.notification-button {
		--count-badge-size: 22px;
		--count-badge-font-size: 12px;
		flex: 0 0 auto;
		width: 36px;
		height: 36px;
		display: inline-grid;
		place-items: center;
		padding: 0;
		font-size: var(--font-size-xl);
	}
	.version {
		flex-shrink: 0;
		padding: 3px 5px;
		border-radius: 8px;
		color: var(--color-light-secondary);
		background: rgbaa(var(--color-dark-secondary), 0.4);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}
	// Scrollable menu sections and their buttons
	nav {
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;

		section {
			display: flex;
			flex-direction: column;
			gap: calc(var(--gutter) * 0.25);
			padding-top: calc(var(--gutter) * 1);
			padding-bottom: calc(var(--gutter) * 1);

			&:not(:last-child) {
				border-bottom: 1px solid rgbaa(var(--color-dark-secondary), 0.5);
			}
		}

		h2 {
			margin: 0 12px 8px;
			color: var(--color-light-tertiary);
			font-size: var(--font-size-caption);
			font-weight: var(--font-weight-medium);
			letter-spacing: 0.18em;
			text-transform: uppercase;
		}

		button {
			display: flex;
			align-items: center;
			gap: calc(var(--gutter) * 1);
			min-height: 44px;
			padding: 10px 12px;
			font-size: var(--font-size-md);

			> i,
			> .team-avatar {
				width: 20px;
				flex-shrink: 0;
				color: var(--color-light-secondary);
				text-align: center;
				font-size: var(--font-size-xl);
			}

			&.active {
				> i:not(.item-trailing-icon),
				> .team-avatar {
					color: var(--color-accent-primary);
				}
			}
		}
		.menu-section-heading {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: var(--gutter-sm);
			margin: 0 12px 8px;

			h2 {
				min-width: 0;
				margin: 0;
			}
			button.section-action {
				flex-shrink: 0;
				width: auto;
				min-height: 24px;
				padding: 6px 8px;
				border-radius: 6px;
				font-size: var(--font-size-caption);
				font-weight: 400;

				&:not(.active) {
					color: var(--color-light-tertiary);
				}
			}
		}
	}

	// Shared navigation and account button styles
	button {
		position: relative;
		width: 100%;
		border: 1px solid transparent;
		border-radius: var(--radius);
		background: transparent;
		color: var(--color-light-secondary);
		text-align: left;
		transition:
			color var(--motion-fast) var(--motion-ease),
			background-color var(--motion-fast) var(--motion-ease),
			border-color var(--motion-fast) var(--motion-ease);

		&:hover,
		&.live {
			border-color: var(--color-dark-secondary);
			background: rgbaa(var(--color-dark-secondary), 0.1);
		}

		&:hover {
			color: var(--color-light-primary);
			transition-duration: 0ms;
		}

		&:active {
			background: rgbaa(var(--color-dark-secondary), 0.15);
			transition-duration: 0ms;
		}

		&:focus-visible {
			outline: 2px solid var(--color-accent-primary);
			outline-offset: 2px;
		}

		&.active {
			border-color: rgbaa(var(--color-accent-primary), 0.4);
			background: rgbaa(var(--color-accent-primary), 0.14);
			color: var(--color-light-primary);
		}

		@media (prefers-reduced-motion: reduce) {
			transition: none;
		}
	}
	.item-label {
		flex: 1;
		min-width: 0;
	}
	.server-status {
		position: relative;
		width: 7px;
		height: 7px;
		flex-shrink: 0;
		border-radius: 50%;
		background: var(--color-accent-secondary);
		box-shadow: 0 0 0 4px rgbaa(var(--color-accent-secondary), 0.12);
		&::after {
			content: "";
			position: absolute;
			inset: -4px;
			border: 1px solid var(--color-accent-secondary);
			border-radius: inherit;
			animation: serverStatusPulse 1800ms var(--ease) infinite;
		}
		@media (prefers-reduced-motion: reduce) {
			&::after {
				animation: none;
				opacity: 0;
			}
		}
	}
	@keyframes serverStatusPulse {
		0% {
			transform: scale(0.6);
			opacity: 0.65;
		}
		100% {
			transform: scale(1.8);
			opacity: 0;
		}
	}

	.account-button {
		display: grid;
		grid-template-columns: 42px minmax(0, 1fr) 12px;
		align-items: center;
		gap: 10px;
		border-radius: 0px;
		border-width: 0px;
		border-top: 1px solid rgbaa(var(--color-dark-secondary), 0.5);
	}

	:global(.menu-account-avatar) {
		background: var(--color-dark-secondary);
	}
	.account-details {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.account-heading {
		display: flex;
		align-items: center;
		gap: 7px;
		min-width: 0;
	}
	.account-name {
		overflow: hidden;
		color: var(--color-light-primary);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-bold);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tag {
		flex-shrink: 0;
		padding: 2px 5px;
		border: 1px solid rgbaa(var(--color-accent-primary), 0.55);
		border-radius: 6px;
		background: rgbaa(var(--color-accent-primary), 0.12);
		color: var(--color-accent-primary);
		font-size: var(--font-size-caption);
	}
	.account-role {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-label);
	}
	.account-chevron {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}
</style>
