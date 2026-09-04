<script lang="ts">
	import { productVersion } from "@spellbook/shared/productVersion";
	import type { ActivePage } from "$lib/types/ui";
	import { tooltip } from "$lib/utils/tooltip";
	import type { UserSession } from "$lib/core";
	import logoUrl from "$lib/resources/logo-plain.svg?url";
	import { infinityMenuState } from "$lib/components/ui/infinityMenu";
	import { celebrateElement } from "$lib/utils/celebrate"
	import { openAccountInfinityMenu } from "./accountInfinityMenu";
	import { createNavigationEntries, createUpdateNavigationEntry } from "./navigationEntries";

	export let activePage: ActivePage;
	export let serverDisplayName = "Current game server";
	export let user: UserSession;
	export let notificationCount = 0;
	export let latestVersion: string | null = null
	export let onSelectPage: (page: ActivePage) => void;
	export let onOpenUpdate: () => void
	export let onClose: () => void;
	export let onLogout: () => Promise<void>;

	let avatarButton: HTMLButtonElement;
	let updateButton: HTMLButtonElement
	$: entries = createNavigationEntries(user.isSuperadmin, notificationCount);
	$: updateEntry = createUpdateNavigationEntry(productVersion, latestVersion)
	$: accountMenuOpen = Boolean(
		avatarButton && $infinityMenuState?.owner === avatarButton,
	);
</script>

<aside class="nav-rail" aria-label="Primary navigation">
	<div class="content-sidebar-background-1"></div>

	<div class="nav-header">
		<div class="logo"><img src={logoUrl} alt="SpellBook" /></div>
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
				{#if entry.badge}<span class="nav-badge">{entry.badge}</span>{/if}
			</button>
		{/each}
		{#if updateEntry}
			<button
				bind:this={updateButton}
				class="update-button"
				type="button"
				aria-label={updateEntry.label}
				use:tooltip={updateEntry.tooltip}
				data-uisfx="select"
				data-uisfx-hover="hover"
				on:click={() => {
					celebrateElement(updateButton)
					onOpenUpdate()
				}}
			>
				<i class={`fa-solid ${updateEntry.icon}`} aria-hidden="true"></i>
				<span>{updateEntry.label}</span>
			</button>
		{/if}
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
			aria-label="Account menu"
			aria-expanded={accountMenuOpen}
			data-uisfx={accountMenuOpen ? "close" : "open"}
			data-uisfx-hover="hover"
			on:click={(event) =>
				openAccountInfinityMenu(event, { user, onSelectPage, onLogout })}
		>
			{#if user.avatarUrl}<img src={user.avatarUrl} alt="" />{:else}<i
					class="fa-solid fa-user"
				></i>{/if}
		</button>
		<button
			type="button"
			aria-label="Close overlay"
			use:tooltip={"Close overlay"}
			data-uisfx="close"
			data-uisfx-hover="hover"
			on:click={onClose}
			><i class="fa-solid fa-xmark" aria-hidden="true"></i></button
		>
	</div>
</aside>

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
	}

	.nav-stack {
		align-self: center;
		width: 100%;
		display: grid;
		justify-items: center;
		gap: var(--gutter-md);
	}

	.update-button {
		width: max-content;
		height: 42px;
		justify-self: start;
		display: flex;
		gap: var(--gutter-sm);
		margin-left: 14px;
		padding: 0 14px;
		border-color: var(--color-accent-secondary);
		border-radius: 999px;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-bold);

		&:hover {
			border-color: var(--color-accent-secondary);
		}
	}

	.nav-footer {
		position: relative;
		z-index: 3;
		display: grid;
		gap: var(--gutter-sm);
	}
	.avatar-button {
		position: relative;
		overflow: hidden;
		border-radius: 50%;
	}

	.nav-badge {
		position: absolute;
		top: -5px;
		right: -5px;
		min-width: 18px;
		height: 18px;
		display: grid;
		place-items: center;
		border: 2px solid var(--color-dark-primary);
		border-radius: 999px;
		padding: 0 4px;
		color: var(--white);
		background: rgb(220 38 38);
		font-size: 9px;
		font-weight: var(--font-weight-bold);
		line-height: 1;
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
</style>
