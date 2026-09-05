<script lang="ts">
	import TodoChecklist from "./TodoChecklist.svelte";
	import type { ActivePage } from "$lib/types/ui";
	import { onMount } from "svelte";
	import { getOverlayApi } from "$lib/core";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import { tooltip } from "$lib/utils/tooltip";
	import {
		containModalTab,
		mountModalEnvironment,
		ModalStateCoordinator,
	} from "$lib/utils/quickActionUi";
	import Icon from "$lib/components/ui/Icon.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import LogSharingButton from "$lib/components/app/LogSharingButton.svelte";

	export let returnFocus: HTMLButtonElement | null = null;
	export let onClose: () => void;
	export let onSelectPage: (page: ActivePage) => void;
	let view: `debug` | `onboarding` = `debug`;

	let modalRoot: HTMLDivElement;
	let dialog: HTMLDivElement;
	let closeButton: HTMLButtonElement;
	const modalState = new ModalStateCoordinator((open) =>
		getOverlayApi().setModalOpen(open),
	);

	onMount(() => {
		const cleanup = mountModalEnvironment(modalRoot, returnFocus);
		const stopVisibility = getOverlayApi().onVisibilityChange((visible) => {
			if (!visible) onClose();
		});
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.key === `Escape`) {
				event.preventDefault();
				onClose();
			}
			containModalTab(event, dialog, document.activeElement);
		};
		window.addEventListener(`keydown`, handleKeydown);
		void syncModal(true);
		closeButton.focus();
		return () => {
			stopVisibility();
			window.removeEventListener(`keydown`, handleKeydown);
			cleanup();
			void syncModal(false);
		};
	});

	async function syncModal(open: boolean): Promise<void> {
		try {
			await modalState.set(open);
		} catch {
			notifyError(`The beta dialog could not update its overlay state.`);
		}
	}

	async function openDiscord(): Promise<void> {
		try {
			await window.chivAuth.openHelp();
		} catch {
			notifyError(`Discord could not be opened. Please try again.`);
		}
	}
</script>

<div class="beta-modal" bind:this={modalRoot}>
	<button
		class="beta-backdrop"
		type="button"
		aria-label="Close beta welcome"
		tabindex="-1"
		on:click={onClose}
	></button>
	<div
		class="beta-dialog"
		bind:this={dialog}
		role="dialog"
		aria-modal="true"
		aria-labelledby="beta-title"
		aria-describedby="beta-description"
		tabindex="-1"
	>
		<header>
			<span class="beta-mark"><Icon name="fa-flask" size="xlg" /></span>
			<button
				class="close-button"
				bind:this={closeButton}
				type="button"
				aria-label="Close beta welcome"
				on:click={onClose}
			>
				<Icon name="fa-xmark" />
			</button>
		</header>
		<nav class="help-tabs" aria-label="Help sections">
			<button
				type="button"
				class:active={view === `debug`}
				aria-pressed={view === `debug`}
				on:click={() => (view = `debug`)}>Debug & help</button
			>
			<button
				type="button"
				class:active={view === `onboarding`}
				aria-pressed={view === `onboarding`}
				on:click={() => (view = `onboarding`)}>Onboarding</button
			>
		</nav>
		{#if view === `onboarding`}
			<div>
				<h1 id="beta-title">Onboarding</h1>
				<p id="beta-description">A few steps to get started with SpellBook.</p>
			</div>
			<TodoChecklist
				onNavigate={(page) => {
					onClose();
					onSelectPage(page);
				}}
			/>
		{:else}
			<div class="beta-copy">
				<p class="eyebrow">SpellBook beta</p>
				<h1 id="beta-title">Welcome to the beta!</h1>
				<p id="beta-description">
					Thanks for helping shape SpellBook. Bugs and errors are expected
					during the beta. As a beta tester, please report anything that goes
					wrong in a Discord ticket.
				</p>
				<p>
					Include what happened, the steps to reproduce it, and any screenshots
					or error messages so we can investigate.
				</p>
				<p>Press <strong>F3</strong> to open or close SpellBook.</p>
			</div>
			<div class="discord-section">
				<h2><Icon name="fa-discord" type="brands" /> Join us on Discord</h2>
				<p>
					Open a ticket for bug reports, talk with other admins, or ask for
					help.
				</p>
				<div class="discord-links">
					<Button
						label="TWA Discord"
						icon="fa-bug"
						variant="primary"
						onClick={() => void openDiscord()}
					/>
					<LogSharingButton />
					<Button
						label="Admin chat"
						icon="fa-comments"
						onClick={() => void openDiscord()}
					/>
				</div>
			</div>
			<footer>
				<div>
					<strong>Get to know SpellBook</strong>
					<p>An interactive, step-by-step walkthrough is on the way.</p>
				</div>
				<span
					class="walkthrough"
					use:tooltip={{ text: `coming soon`, placement: `top` }}
				>
					<Button
						label="Walkthrough"
						icon="fa-route"
						title="coming soon"
						disabled
					/>
				</span>
			</footer>
		{/if}
	</div>
</div>

<style lang="scss">
	.help-tabs {
		display: flex;
		gap: var(--gutter-sm);
	}
	.help-tabs button {
		padding: var(--gutter-sm) var(--gutter-md);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
	}
	.help-tabs .active {
		color: var(--color-accent-primary);
		border-color: currentColor;
	}
	.beta-modal {
		position: fixed;
		inset: 0;
		z-index: 35;
		display: grid;
		place-items: center;
		padding: var(--gutter-lg);
	}
	.beta-backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		border-radius: 0;
		background: rgba(2, 8, 13, 0.76);
	}
	.beta-dialog {
		position: relative;
		width: min(560px, 100%);
		max-height: calc(100vh - 2 * var(--gutter-lg));
		overflow: auto;
		display: grid;
		gap: var(--gutter-lg);
		padding: var(--gutter-lg);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius-xl);
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
	}
	header,
	footer,
	h2,
	.discord-links {
		display: flex;
		align-items: center;
		gap: var(--gutter-md);
	}
	header,
	footer {
		justify-content: space-between;
	}
	.beta-mark {
		color: var(--color-accent-primary);
	}
	.close-button {
		padding: var(--gutter-sm);
	}
	.beta-copy,
	.discord-section {
		display: grid;
		gap: var(--gutter-md);
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	h1 {
		font-size: var(--font-size-2xl);
	}
	h2 {
		font-size: var(--font-size-md);
	}
	p {
		color: var(--color-light-secondary);
		line-height: 1.6;
	}
	.eyebrow {
		color: var(--color-accent-primary);
		font-size: var(--font-size-xs);
	}
	.discord-links,
	footer {
		flex-wrap: wrap;
	}
	footer {
		border-top: 1px solid var(--color-dark-tertiary);
		padding-top: var(--gutter-lg);
	}
	footer p {
		margin-top: var(--gutter-sm);
		font-size: var(--font-size-xs);
	}
	.walkthrough {
		display: inline-flex;
	}
	.walkthrough :global(button) {
		pointer-events: none;
	}
</style>
