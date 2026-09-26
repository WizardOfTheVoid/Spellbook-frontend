<script lang="ts">
	import KeybindValue from "$lib/components/ui/KeybindValue.svelte";
	import { navigation } from "$lib/navigation/navigation";
	import IconButton from "$lib/components/ui/IconButton.svelte";
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
	import Tabs from "$lib/components/ui/tabs.svelte";
	import LogSharingButton from "$lib/components/app/LogSharingButton.svelte";
	import changelog from "../../../../../../../CHANGELOG.md?raw";
	import { parseChangelog, type HelpView } from "./helpNotice";

	export let returnFocus: HTMLButtonElement | null = null;
	export let onClose: () => void;
	export let onCredits: () => void;
	export let onSelectPage: (page: ActivePage) => void;
	export let onDisplayed: (() => void) | undefined = undefined;
	export let view: HelpView = `welcome`;
	const helpTabs = [
		{ value: `welcome`, label: `Help` },
		{ value: `onboarding`, label: `Onboarding` },
		{ value: `changelogs`, label: `Changelogs` },
	];

	let modalRoot: HTMLDivElement;
	let dialog: HTMLDivElement;
	let closeButton: HTMLButtonElement | undefined;
	let displayed = false;
	const releases = parseChangelog(changelog);
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
		void markDisplayed();
		closeButton?.focus();
		return () => {
			stopVisibility();
			window.removeEventListener(`keydown`, handleKeydown);
			cleanup();
			void syncModal(false);
		};
	});

	async function markDisplayed(): Promise<void> {
		if (displayed || !onDisplayed) return;
		try {
			if (!(await getOverlayApi().isVisible())) return;
			displayed = true;
			onDisplayed();
		} catch {
			// The modal remains available even if its initial visibility cannot be read.
		}
	}

	async function syncModal(open: boolean): Promise<void> {
		try {
			await modalState.set(open);
		} catch {
			notifyError(`The help dialog could not update its overlay state.`);
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

<div class="help-modal" bind:this={modalRoot}>
	<button
		class="help-backdrop"
		type="button"
		aria-label="Close help"
		tabindex="-1"
		on:click={onClose}
	></button>
	<div
		class="help-dialog"
		bind:this={dialog}
		role="dialog"
		aria-modal="true"
		data-navigation-help
		aria-labelledby="help-title"
		aria-describedby="help-description"
		tabindex="-1"
	>
		<header>
			<IconButton
				icon="fa-arrow-left"
				ariaLabel="Back"
				tooltip="Back"
				navigationBack={true}
				onClick={() => (view !== `welcome` ? (view = `welcome`) : onClose())}
			/>
			<span class="help-mark"
				><Icon name="fa-circle-question" size="xlg" /></span
			>
			<IconButton
				icon="fa-xmark"
				ariaLabel="Close help"
				tooltip="Close"
				bind:element={closeButton}
				onClick={onClose}
			/>
		</header>
		<Tabs
			items={helpTabs}
			value={view}
			label="Help sections"
			onChange={(value) =>
				void navigation.visit(() => {
					view = value as HelpView;
				})}
		>
			{#if view === `onboarding`}
				<div>
					<h1 id="help-title">Onboarding</h1>
					<p id="help-description">
						A few steps to get started with SpellBook.
					</p>
				</div>
				<TodoChecklist
					onNavigate={(page) =>
						void navigation.visit(async () => {
							onClose();
							await onSelectPage(page);
						})}
				/>
			{:else if view === `changelogs`}
				<div>
					<h1 id="help-title">Changelog</h1>
					<p id="help-description">What changed in each SpellBook release :]</p>
				</div>
				<div class="changelog">
					{#each releases as release (release.version)}
						<section>
							<h2>v{release.version}</h2>
							<ul>
								{#each release.notes as note}<li>{note}</li>{/each}
							</ul>
						</section>
					{/each}
				</div>
			{:else}
				<div class="help-copy">
					<h1 id="help-title">SpellBook Help</h1>
					<p id="help-description">
						Find setup guidance, see what changed in recent releases, and get
						support with SpellBook. Start with Onboarding if you are new here.
					</p>
					<p>
						When reporting a problem, include what happened, the steps to
						reproduce it, and any screenshots or error messages.
					</p>
					<p>
						Press <strong><KeybindValue name="overlayKey" /></strong> to open or
						close SpellBook.
					</p>
				</div>
				<div class="discord-section">
					<h2><Icon name="fa-discord" type="brands" /> Join us on Discord</h2>
					<p>
						Open a ticket for reports, talk with other admins, or ask for help.
					</p>
					<div class="discord-links">
						<Button
							label="TWA Discord"
							icon="fa-discord"
							variant="primary"
							onClick={() => void openDiscord()}
						/>
						<Button label="Credits" icon="fa-film" onClick={onCredits} />
						<Button
							label="Onboarding"
							icon="fa-circle-user-circle-plus"
							onClick={() =>
								void navigation.visit(() => {
									view = `onboarding`;
								})}
						/>
					</div>
				</div>
				<footer>
					<div>
						<strong>Get to know SpellBook</strong>
						<p>An interactive, step-by-step walkthrough is on the way. WIP</p>
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
		</Tabs>
	</div>
</div>

<style lang="scss">
	.help-modal {
		position: fixed;
		inset: 0;
		z-index: 35;
		display: grid;
		place-items: center;
		padding: var(--gutter-lg);
	}
	.help-backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		border-radius: 0;
		background: rgba(2, 8, 13, 0.76);
	}
	.help-dialog {
		position: relative;
		width: min(560px, 100%);
		height: 70vh;
		max-height: 70vh;
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
	.help-mark {
		color: var(--color-accent-primary);
	}
	.help-copy,
	.discord-section,
	.changelog {
		display: grid;
		gap: var(--gutter-md);
	}
	.changelog section {
		display: grid;
		gap: var(--gutter-sm);
		border-top: 1px solid var(--color-dark-tertiary);
		padding-top: var(--gutter-md);
	}
	.changelog ul {
		margin: 0;
		padding-left: var(--gutter-lg);
		color: var(--color-light-secondary);
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
