<script lang="ts">
	import { onMount, tick } from "svelte";
	import VariableTagPicker from "$lib/components/profiles/VariableTagPicker.svelte";
	import {
		insertMessageTag,
		type MessageTagItem,
	} from "$lib/utils/messageTags";
	import type { QuickActionMessageKind } from "$lib/utils/quickActions";
	import {
		containModalTab,
		mountModalEnvironment,
	} from "$lib/utils/quickActionUi";

	export let kind: QuickActionMessageKind;
	export let draft: string;
	export let resolvedMessage: string;
	export let tags: MessageTagItem[] = [];
	export let sending = false;
	export let onDraftChange: (value: string) => void;
	export let onSend: () => void;
	export let onCancel: () => void;
	export let returnFocus: HTMLButtonElement | null = null;
	export let quickActionsRoot: HTMLElement | null = null;

	let textarea: HTMLTextAreaElement;
	let modalRoot: HTMLDivElement;
	let dialog: HTMLDivElement;

	$: label = kind === `admin` ? `Adminsay` : `Serversay`;

	onMount(() => {
		const focusRoots = quickActionsRoot ? [quickActionsRoot, dialog] : dialog;
		const cleanup = mountModalEnvironment(
			modalRoot,
			returnFocus,
			quickActionsRoot ? [quickActionsRoot] : [],
		);
		const handleTab = (event: KeyboardEvent) => {
			containModalTab(event, focusRoots, document.activeElement);
		};
		window.addEventListener(`keydown`, handleTab);
		textarea.focus();
		return () => {
			window.removeEventListener(`keydown`, handleTab);
			cleanup();
		};
	});

	async function insertTag(tag: string): Promise<void> {
		if (!textarea) return;
		const insertion = insertMessageTag(
			draft,
			tag,
			textarea.selectionStart,
			textarea.selectionEnd,
			180,
		);
		draft = insertion.value;
		onDraftChange(draft);
		await tick();
		textarea.focus();
		textarea.setSelectionRange(
			insertion.selectionStart,
			insertion.selectionEnd,
		);
	}
</script>

<div class="quick-action-modal" bind:this={modalRoot}>
	<button
		class="quick-action-modal__backdrop"
		type="button"
		aria-label="Cancel message"
		tabindex="-1"
		on:click={onCancel}
	></button>

	<div
		bind:this={dialog}
		class="quick-action-modal__dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="quick-action-modal-title"
		tabindex="-1"
	>
		<header>
			<p>Quick Actions</p>
			<h1 id="quick-action-modal-title">{label} message</h1>
		</header>

		<form on:submit|preventDefault={onSend}>
			<label class="quick-action-modal__field">
				<span>Message</span>
				<textarea
					bind:this={textarea}
					bind:value={draft}
					on:input={() => onDraftChange(draft)}
					maxlength="180"
					rows="4"
				></textarea>
				<small>{draft.length}/180 characters</small>
			</label>

			<VariableTagPicker {tags} onSelect={(tag) => void insertTag(tag)} />

			<div class="quick-action-modal__preview" aria-label="Message preview">
				<p>player1: I love this app</p>
				<p>player2: Bla bla bla</p>
				<p>
					<strong
						class:quick-action-modal__admin={kind === `admin`}
						class:quick-action-modal__server={kind === `server`}
					>
						{label}:
					</strong>
					{resolvedMessage}
				</p>
			</div>

			<footer>
				<button type="button" on:click={onCancel}>Cancel</button>
				<button
					class="quick-action-modal__send"
					type="submit"
					disabled={sending || !draft.trim()}
				>
					{sending ? `Sending...` : `Send`}
				</button>
			</footer>
		</form>
	</div>
</div>

<style lang="scss">
	.quick-action-modal {
		position: fixed;
		inset: 0;
		z-index: 35;
		display: grid;
		place-items: center;
		padding: var(--gutter-lg);
	}

	.quick-action-modal__backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		border-radius: 0;
		background: rgba(2, 8, 13, 0.76);
	}

	.quick-action-modal__dialog {
		position: relative;
		width: min(520px, 100%);
		max-height: calc(100vh - 60px);
		display: grid;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-lg);
		color: var(--color-light-primary);
		background: rgba(5, 13, 21, 0.98);
		box-shadow: var(--shadow);
		overflow: auto;
	}

	.quick-action-modal__dialog header,
	.quick-action-modal__dialog form,
	.quick-action-modal__field {
		display: grid;
		gap: var(--gutter-sm);
	}

	.quick-action-modal__dialog header p {
		margin: 0;
		color: var(--color-accent-tertiary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
		text-transform: uppercase;
	}

	.quick-action-modal__dialog form {
		gap: var(--gutter-md);
	}

	.quick-action-modal__field {
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.quick-action-modal__field textarea {
		width: 100%;
		resize: vertical;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: 12px;
		color: var(--color-light-primary);
		background: rgba(3, 12, 18, 0.76);
		font: inherit;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
		line-height: 1.4;
		outline: none;
	}

	.quick-action-modal__field textarea:focus {
		border-color: var(--color-accent-primary);
	}

	.quick-action-modal__field small {
		color: var(--color-light-tertiary);
		font-weight: var(--font-weight);
		text-align: right;
	}

	.quick-action-modal__preview {
		display: grid;
		gap: 4px;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: 12px;
		background: rgba(21, 40, 55, 0.52);
		font-size: var(--font-size-md);
		line-height: 1.4;
		overflow-wrap: anywhere;
	}

	.quick-action-modal__preview p {
		margin: 0;
	}

	.quick-action-modal__admin {
		color: #ff6157;
	}

	.quick-action-modal__server {
		color: #f4dda0;
	}

	.quick-action-modal__dialog footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--gutter-sm);
	}

	.quick-action-modal__dialog footer button {
		min-height: var(--control-height-sm);
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.quick-action-modal__send {
		border-color: var(--color-accent-primary);
		background: rgbaa(var(--color-accent-primary), 0.12);
	}
</style>
