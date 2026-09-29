<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { Editor, type JSONContent } from "@tiptap/core";
	import { exitSuggestion } from "@tiptap/suggestion";
	import HelpHint from "$lib/components/ui/helpHint.svelte";
	import type {
		PlayerAction,
		PlayerNotePlayerReference,
		PlayerNoteUserReference,
	} from "$lib/core";
	import {
		createPlayerNoteDocument,
		createPlayerNoteExtensions,
		serializePlayerNoteDocument,
		refreshPlayerNoteReferenceLabels,
		playerNoteSuggestionKeys,
	} from "$lib/utils/playerNoteEditor";

	export let content: string;
	export let actions: PlayerAction[] = [];
	export let users: PlayerNoteUserReference[] = [];
	export let players: PlayerNotePlayerReference[] | undefined = undefined;
	export let onSearchPlayers:
		| ((query: string) => Promise<PlayerNotePlayerReference[]>)
		| undefined = undefined;
	export let playerId: number;
	export let disabled = false;
	export let compact = false;
	export let ariaLabel: string | null = null;
	export let onChange: (content: string) => void = () => undefined;
	export let onSubmit: (() => void) | null = null;
	export let onOpenAction: (actionId: number) => void = () => undefined;
	export let onOpenUser: (userId: number) => void = () => undefined;
	export let onOpenPlayer: (playerId: number) => void = () => undefined;

	let host: HTMLDivElement;
	let editor: Editor | null = null;
	let renderedContent = content;
	let labelsKey = ``;
	const labels = { actions, users, players, onSearchPlayers };
	$: Object.assign(labels, { actions, users, players, onSearchPlayers });

	export function dismissSuggestions(): boolean {
		if (!editor) return false;
		const activeKeys = playerNoteSuggestionKeys.filter(
			(key) => key.getState(editor!.state)?.active,
		);
		for (const key of activeKeys) exitSuggestion(editor.view, key);
		return activeKeys.length > 0;
	}

	onMount(() => {
		labelsKey = signature();
		editor = new Editor({
			element: host,
			extensions: createPlayerNoteExtensions(labels),
			content: createPlayerNoteDocument(content, labels),
			editable: !disabled,
			editorProps: {
				handleKeyDown: (_view, event) => {
					if (
						!onSubmit ||
						event.key !== `Enter` ||
						!event.ctrlKey ||
						event.altKey ||
						event.shiftKey ||
						event.isComposing
					)
						return false;
					if (!disabled && !event.repeat) onSubmit();
					return true;
				},
				attributes: {
					class: `player-note-editor__content`,
					role: `textbox`,
					"aria-multiline": `true`,
					...(ariaLabel ? { "aria-label": ariaLabel } : {}),
				},
				clipboardTextSerializer: (slice) =>
					serializePlayerNoteDocument({
						type: `doc`,
						content: slice.content.toJSON() as JSONContent[],
					}),
				transformPastedHTML: sanitizeReferenceHtml,
			},
			onUpdate: ({ editor: current }) => {
				renderedContent = serializePlayerNoteDocument(current.getJSON());
				onChange(renderedContent);
			},
		});
		host.addEventListener(`click`, openReference);
	});

	onDestroy(() => {
		host?.removeEventListener(`click`, openReference);
		editor?.destroy();
		editor = null;
	});

	$: editor?.setEditable(!disabled, false);
	$: if (editor) {
		const nextLabelsKey = signature();
		if (content !== renderedContent || nextLabelsKey !== labelsKey) {
			const contentChanged = content !== renderedContent;
			renderedContent = content;
			labelsKey = nextLabelsKey;
			if (contentChanged)
				editor.commands.setContent(createPlayerNoteDocument(content, labels), {
					emitUpdate: false,
				});
			else {
				const transaction = refreshPlayerNoteReferenceLabels(
					editor.state,
					labels,
				);
				if (transaction) editor.view.dispatch(transaction);
			}
		}
	}

	function signature(): string {
		return `${actions.map((action) => `${action.id}:${action.updatedAt}`).join(`,`)}|${users.map((user) => `${user.id}:${user.displayName}:${user.isActive}:${user.bannedAt ?? ``}`).join(`,`)}|${players?.map((player) => `${player.id}:${player.latestName}:${player.playfabId}`).join(`,`) ?? ``}`;
	}

	function openReference(event: MouseEvent): void {
		const target =
			event.target instanceof Element ?
				event.target.closest<HTMLElement>(`[data-note-reference]`)
			:	null;
		if (!target) return;
		const id = Number(target.dataset.referenceId);
		if (!Number.isSafeInteger(id) || id < 1) return;
		if (target.dataset.noteReference === `action`) onOpenAction(id);
		if (target.dataset.noteReference === `user`) onOpenUser(id);
		if (target.dataset.noteReference === `player`) onOpenPlayer(id);
	}

	function sanitizeReferenceHtml(html: string): string {
		const document = new DOMParser().parseFromString(html, `text/html`);
		for (const node of document.querySelectorAll<HTMLElement>(
			`[data-note-reference="action"]`,
		)) {
			if (Number(node.dataset.playerId) !== playerId)
				node.replaceWith(document.createTextNode(node.textContent ?? ``));
		}
		return document.body.innerHTML;
	}
</script>

<div
	class="player-note-editor"
	class:player-note-editor--disabled={disabled}
	class:player-note-editor--compact={compact}
	bind:this={host}
></div>
{#if compact}
	<div class="note-help note-help--compact">
		<span>@ mentions · # actions</span><HelpHint
			text={`Type @ to mention ${players === undefined ? `an admin` : `a player or admin`} or # to link an action from this player's history. Choose a suggestion to insert it.${onSubmit ? ` Submit with Ctrl+Enter.` : ``}`}
		/>
	</div>
{:else}
	<p class="note-help">
		Type <strong>@</strong> to mention {players === undefined ? `an admin` : (
			`a player or admin`
		)} or <strong>#</strong> to link an action from this player's history. Choose
		a suggestion to insert it.
	</p>
{/if}

<style lang="scss">
	.note-help {
		margin: 0;
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
		line-height: 1.5;
	}
	.player-note-editor {
		min-height: 7rem;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		background: rgba(3, 12, 18, 0.66);
		cursor: text;
	}

	.player-note-editor:focus-within {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 1px rgbaa(var(--color-accent-primary), 0.32);
	}

	.player-note-editor--disabled {
		opacity: 0.72;
		cursor: default;
	}
	.player-note-editor--compact {
		min-height: 4.5rem;
		max-height: 9rem;
		overflow: auto;
	}
	.note-help--compact {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	:global(.player-note-editor__content) {
		min-height: inherit;
		padding: var(--gutter-sm) var(--gutter-md);
		outline: none;
		white-space: pre-wrap;
	}

	:global(.player-note-editor__content p) {
		margin: 0;
	}

	:global(.player-note-reference) {
		display: inline-flex;
		align-items: center;
		max-width: 100%;
		margin: 0 0.12rem;
		padding: 0.08rem 0.38rem;
		border: 1px solid rgbaa(var(--color-accent-primary), 0.5);
		border-radius: 0.35rem;
		background: transparent;
		color: var(--color-light-primary);
		line-height: 1.35;
		cursor: pointer;
		user-select: all;
		transition:
			border-color 120ms ease,
			color 120ms ease;
	}

	:global(.player-note-reference--user) {
		border-color: rgba(118, 177, 255, 0.52);
	}

	:global(.player-note-reference:hover) {
		border-color: var(--color-primary);
		color: var(--color-primary);
	}

	:global(.player-note-reference:active) {
		border-color: var(--color-light-primary);
	}

	:global(.ProseMirror-selectednode.player-note-reference) {
		border-color: var(--color-primary);
		box-shadow: 0 0 0 1px var(--color-primary);
	}

	:global(.player-note-suggestions) {
		position: fixed;
		z-index: 1200;
		display: grid;
		width: min(24rem, calc(100vw - 2rem));
		max-height: 16rem;
		overflow-y: auto;
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: 0.25rem;
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
	}

	:global(.player-note-suggestion) {
		display: grid;
		gap: 0.1rem;
		width: 100%;
		border: 0;
		border-radius: calc(var(--radius) - 0.2rem);
		padding: 0.45rem 0.55rem;
		background: transparent;
		color: var(--color-light-primary);
		text-align: left;
	}

	:global(.player-note-suggestion small) {
		overflow: hidden;
		color: var(--color-light-tertiary);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.player-note-suggestions__empty) {
		margin: 0;
		padding: 0.55rem;
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}

	:global(.player-note-suggestion:hover),
	:global(.player-note-suggestion.is-selected) {
		background: rgbaa(var(--color-accent-primary), 0.15);
	}
</style>
