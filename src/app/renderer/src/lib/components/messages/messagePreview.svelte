<script lang="ts">
	import { authState } from '$lib/auth/user'
	import { getAdminName } from '@spellbook/shared/adminName.js'
	export let kind: `admin` | `server` | `reason`;
	export let message: string;
	export let count: string | null = null
	export let sample = false;
	$: label = kind === `admin` ? getAdminName($authState.user, `Example admin`) : `<SERVER>`
</script>

<section class="message-preview" aria-label="Message preview">
	<header>
		<span>Preview</span><small>{count ?? `${message.length}/180`}</small>
	</header>
	<div
		class="message-preview__body"
		class:message-preview__chat={kind === `admin` || kind === `server`}
	>
		{#if kind !== `reason`}
			<p class="message-preview__ambient">MAGIC: You should open the credits</p>
			<p class="message-preview__ambient">Lancelot: Half machine, half man</p>
		{/if}
		<p
			class:admin={kind === `admin`}
			class:server={kind === `server`}
			class:reason={kind === `reason`}
		>
			{#if kind !== `reason`}<span>{label}:</span>{` `}{/if}{message ||
				`Your message appears here`}
		</p>
	</div>
	{#if message.length > 180}<small class="message-preview__error"
			>Resolved message exceeds 180 characters, including the prefix.</small
		>{/if}
</section>

<style lang="scss">
	.message-preview {
		pointer-events: none;
		user-select: none;
		display: grid;
		gap: var(--gutter-sm);
	}

	header {
		display: flex;
		justify-content: space-between;
		gap: var(--gutter-sm);
	}

	header small {
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: normal;
	}

	.message-preview__ambient {
		color: var(--color-light-secondary);
	}

	.message-preview__body {
		position: relative;
		isolation: isolate;
		display: grid;
		gap: 6px;
		border: 1px solid var(--color-dark-secondary);
		background-color: rgba(0, 0, 0, 0.25);
		border-radius: var(--radius);
		padding: 12px;
		font-size: 14.5px;
		overflow-wrap: anywhere;
		white-space: pre-wrap;
		// font-family: "Arial Regular", Arial, sans-serif;
		font-weight: 400;
	}

	.message-preview__chat {
		border-color: transparent;
	}

	.message-preview__chat::before {
		content: "";
		position: absolute;
		inset: 0;
		z-index: -1;
		border-radius: inherit;
		background: url("/text-preview-bg.jpg") center / cover no-repeat;
		opacity: 0.55;
		pointer-events: none;
	}
	p {
		margin: 0;
	}
	.reason {
		color: #fff;
	}
	.server {
		text-transform: uppercase;
		font-size: 18px;
		color: #ffc936;
		text-shadow: -2px 2px 0px rgba(0, 0, 0, 0.6);
		font-weight: 400;
	}
	.admin,
	.message-preview__error {
		color: #ff4b3e;
		text-shadow: -1px 1px 0px rgba(0, 0, 0, 0.75);
		font-weight: 500;
	}
</style>
